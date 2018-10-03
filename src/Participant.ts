import * as Web3  from 'web3'
import { BigNumber } from 'bignumber.js'
import { Buffer } from 'safe-buffer'
import * as util from "ethereumjs-util"
import PlasmoidWrapper from '../build/wrappers/Plasmoid'
import * as contracts from './index'
import * as truffle from 'truffle-contract'
import { Checkpoint} from './Checkpoint'
import { AccountService } from './AccountService'
import { PlasmaState } from './PlasmaState'
import * as solUtils from './SolidityUtils'


const ethSigUtil = require('eth-sig-util')
const numberToBN = require('number-to-bn')

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))

export class Participant {
  address: string
  plasmoidContract: contracts.Plasmoid.Contract
  plasmaState: PlasmaState
  accountService: AccountService

  constructor (address: string, plasmoidContract: contracts.Plasmoid.Contract, accountingService: AccountService, channelId?: BigNumber, amount?: BigNumber) {
    this.address = address
    this.plasmoidContract = plasmoidContract
    this.plasmaState = new PlasmaState(channelId, amount, address)
    this.accountService = accountingService
  }

  setChannel (channelId: BigNumber) {
    this.plasmaState.channelId = channelId
  }

  setAmount (amount: BigNumber) {
    this.plasmaState.amount = amount
  }

  setOwner (owner: string) {
    this.plasmaState.owner = owner
  }

  async sign (address: string, data: string | Buffer): Promise<string> {
    if (data instanceof Buffer) {
      data = data.toString('hex')
    }
    let result = await web3.eth.sign(address, data)
    // result += '01'
    return result
  }

  recover (signature: string, data: any): string {
    // signature = signature.slice(0, -2)
    const result = ethSigUtil.recoverPersonalSignature({ sig: signature, data: data})
    return result
  }

  makeStateDigest (): Buffer {
    const digest = util.sha3(this.plasmaState.toBuffer())
    return digest
  }

  async makeAcceptanceSignature (): Promise<string> {
    const digest = solUtils.keccak256(util.toBuffer('acceptCurrentState'), this.plasmaState.toBuffer())

    const acceptanceDigestUser: string = solUtils.bytes32To0xString(digest)
    const acceptanceDigestFromBlockchain: string = await this.plasmoidContract.acceptCurrentStateDigest(this.plasmaState.channelId, this.plasmaState.amount, this.plasmaState.owner)
    if (acceptanceDigestUser !== acceptanceDigestFromBlockchain) {
      throw Error(`acceptance digests dont equals! acceptanceDigestUser = ${acceptanceDigestUser}, acceptanceDigestFromBlockchain = ${acceptanceDigestFromBlockchain}`)
    }
    const acceptanceSignature = await this.sign(this.address, acceptanceDigestUser)
    // console.log(acceptanceSignature)
    // console.log(acceptanceSignature.length)
    return acceptanceSignature
  }

  async makeAcceptanceSignatureForOther (participant: Participant): Promise<string> {
    const digest = solUtils.keccak256(util.toBuffer('acceptCurrentState'), solUtils.bignumberToUint256(participant.plasmaState.channelId), solUtils.bignumberToUint256(participant.plasmaState.amount), solUtils.stringToAddress(participant.plasmaState.owner))
    const acceptanceDigestUser: string = solUtils.bytes32To0xString(digest)
    const acceptanceDigestFromBlockchain: string = await this.plasmoidContract.acceptCurrentStateDigest(participant.plasmaState.channelId, participant.plasmaState.amount, participant.plasmaState.owner)
    if (acceptanceDigestUser !== acceptanceDigestFromBlockchain) {
      throw Error('acceptance digests dont equals!')
    }
    const acceptanceSignature = await this.sign(participant.address, acceptanceDigestUser)

    return acceptanceSignature
  }

  async makeOwnersAcceptanceSignature (checkpointId: BigNumber, ownersMerkleRoot: string): Promise<string> {
    const digest = solUtils.keccak256(util.toBuffer('acceptCurrentOwnersState'), solUtils.bignumberToUint256(checkpointId), util.toBuffer(ownersMerkleRoot))
    const acceptanceDigestUser: string = solUtils.bytes32To0xString(digest)
    const acceptanceDigestFromBlockchain: string = await this.plasmoidContract.acceptCurrentOwnersStateDigest(checkpointId, ownersMerkleRoot)
    if (acceptanceDigestUser !== acceptanceDigestFromBlockchain) {
      throw Error('owners acceptance digests dont equals!')
    }
    const acceptanceSignature = await this.sign(this.address, acceptanceDigestUser)

    return acceptanceSignature
  }

  async makeCheckpoint (): Promise<truffle.TransactionResult> {
    await this.accountService.updateTrees()

    const stateTreeRoot =             this.accountService.stateTreeRoot()
    const stateAcceptanceTreeRoot =   this.accountService.stateAcceptanceTreeRoot()
    const ownersTreeRoot =            this.accountService.ownersTreeRoot()
    const ownersAcceptanceTreeRoot =  this.accountService.ownersAcceptanceTreeRoot()

    const stateSignature =            await this.sign(this.address, stateTreeRoot)
    const stateAcceptanceSignature =  await this.sign(this.address, stateAcceptanceTreeRoot)
    const ownersSignature =           await this.sign(this.address, ownersTreeRoot)
    const ownersAcceptanceSignature = await this.sign(this.address, ownersAcceptanceTreeRoot)

    const tx = await this.plasmoidContract.checkpoint(
      stateTreeRoot,
      stateAcceptanceTreeRoot,
      ownersTreeRoot,
      ownersAcceptanceTreeRoot,
      stateSignature + '01',
      stateAcceptanceSignature + '01',
      ownersSignature + '01',
      ownersAcceptanceSignature + '01',
      { from: this.address })

    const eventArgs: PlasmoidWrapper.DidCheckpoint = tx.logs[0].args
    const checkpointUid: BigNumber = eventArgs.checkpointId as BigNumber
    const checkpointObj = new Checkpoint(checkpointUid, stateTreeRoot, stateAcceptanceTreeRoot, ownersTreeRoot, ownersAcceptanceTreeRoot)
    this.accountService.addCheckpoint(checkpointObj)
    return tx
  }

  async transfer (channelId: BigNumber, addressA: string, addressB: string): Promise<truffle.TransactionResult> {
    const transferDigest = await this.plasmoidContract.transferDigest(channelId, addressB)
    const transferSignature = await this.sign(addressA, transferDigest)
    const tx = await this.plasmoidContract.transfer(channelId, addressB, transferSignature + '01')
    return tx
  }

  async startDispute (channelId: BigNumber, amount: BigNumber, checkpointId: BigNumber): Promise<truffle.TransactionResult> {
    await this.accountService.updateTrees()
    const channelIdAsBuffer = solUtils.bignumberToUint256(channelId)
    const amountAsBuffer = solUtils.bignumberToUint256(amount)
    const ownerAsBuffer = solUtils.stringToAddress(this.address)
    const checkpointIdAsBuffer = solUtils.bignumberToUint256(checkpointId)

    const disputeRequestDigest = solUtils.keccak256(channelIdAsBuffer, amountAsBuffer, ownerAsBuffer, checkpointIdAsBuffer)
    // console.log(`disputeRequestDigest = ${solUtils.bufferTo0xString(disputeRequestDigest)}`)
    const disputeRequestSignature = await this.sign(this.address, disputeRequestDigest)
    const disputeRequestSignatureAsString = util.addHexPrefix(disputeRequestSignature) + '01'
    const concatenatedOwnersProofAsString: string = solUtils.bufferArrayTo0xString(this.accountService.ownersTree!.proof(util.sha3(this.address)))

    const tx = await this.plasmoidContract.startDispute(channelId, amount, this.address, disputeRequestSignatureAsString, checkpointId, concatenatedOwnersProofAsString)
    return tx
  }


  async answerDispute (plasmaState: PlasmaState, disputeRequestID: string, userAcceptanceSignature: string, acceptanceMerkleProof: string): Promise<truffle.TransactionResult> {
    const tx = await this.plasmoidContract.answerDispute(plasmaState.channelId, plasmaState.amount, disputeRequestID, userAcceptanceSignature + '01', acceptanceMerkleProof)
    return tx
  }

  async finalizeDispute (disputeRequestID: string): Promise<truffle.TransactionResult> {
    let tx
    if (!disputeRequestID) {
      throw Error('disputeRequestID is undefined or null')
    } else {
      tx = await this.plasmoidContract.finalizeDispute(disputeRequestID)
    }

    return tx
  }

}
