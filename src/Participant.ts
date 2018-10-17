import * as Web3  from 'web3'
import { BigNumber } from 'bignumber.js'
import { Buffer } from 'safe-buffer'
import * as util from "ethereumjs-util"
import PlasmoidWrapper from '../build/wrappers/Plasmoid'
import { DepositTransaction } from './DepositTransaction'
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

  constructor (address: string, plasmoidContract: contracts.Plasmoid.Contract, accountingService: AccountService, amount?: BigNumber) {
    this.address = address.toLowerCase()
    this.plasmoidContract = plasmoidContract
    this.plasmaState = new PlasmaState(new BigNumber(0), amount, address)
    this.accountService = accountingService
  }

  setAmount (amount: BigNumber) {
    this.plasmaState.amount = amount
  }

  setAddress (address: string) {
    this.address = address
    this.plasmaState.owner = address
  }

  async sign (data: string | Buffer): Promise<string> {
    if (data instanceof Buffer) {
      data = data.toString('hex')
    }
    let result = await web3.eth.sign(this.address, data)
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

  // async makeDeposit (): Promise<string> {
  //   const digest = solUtils.keccak256(util.toBuffer('acceptCurrentState'), this.plasmaState.toBuffer())
  //
  //   const acceptanceDigestUser: string = solUtils.bytes32To0xString(digest)
  //   // const acceptanceDigestFromBlockchain: string = await this.plasmoidContract.acceptCurrentStateDigest(this.plasmaState.channelId, this.plasmaState.amount, this.plasmaState.owner)
  //   // if (acceptanceDigestUser !== acceptanceDigestFromBlockchain) {
  //   //   throw Error(`acceptance digests dont equals! acceptanceDigestUser = ${acceptanceDigestUser}, acceptanceDigestFromBlockchain = ${acceptanceDigestFromBlockchain}`)
  //   // }
  //   // const acceptanceSignature = await this.sign(this.address, acceptanceDigestUser)
  //   // console.log(acceptanceSignature)
  //   // console.log(acceptanceSignature.length)
  //   const acceptanceSignature = ''
  //   return acceptanceSignature
  // }

  async deposit (amount: BigNumber): Promise<truffle.TransactionResult> {
    const tx = await this.plasmoidContract.deposit(amount, { from: this.address })
    const depositTx = new DepositTransaction(this.address, amount)
    this.accountService.deposits.push(depositTx)
    return tx
  }

  async startWithdrawal (checkpointID: BigNumber, slotID: BigNumber, amount: BigNumber, lock: string, proof: string, unlock: string,): Promise<truffle.TransactionResult> {
    const tx = await this.plasmoidContract.startWithdrawal(checkpointID, slotID, amount, lock, proof, unlock, { from: this.address })
    return tx
  }

  async finaliseWithdrawal (withdrawalID: BigNumber): Promise<truffle.TransactionResult> {
    const tx = await this.plasmoidContract.finaliseWithdrawal(withdrawalID)
    return tx
  }

  makeDepositDigest (): Buffer {
    const slotIDBuffer = solUtils.bignumberToUint256(this.plasmaState.slotID)
    const amountBuffer = solUtils.bignumberToUint256(this.plasmaState.amount)
    return Buffer.concat([solUtils.stringToBytes('d'), slotIDBuffer, amountBuffer])
  }

  makeWithdrawalDigest (): Buffer {
    const slotIDBuffer = solUtils.bignumberToUint256(this.plasmaState.slotID)
    const amountBuffer = solUtils.bignumberToUint256(this.plasmaState.amount)
    return Buffer.concat([solUtils.stringToBytes('w'), slotIDBuffer, amountBuffer])
  }

  async makeCheckpoint (): Promise<truffle.TransactionResult> {
    await this.accountService.updateTrees()

    const txMerkleRoot = this.accountService.txMerkleRoot()
    const changesMerkleRoot = this.accountService.changesMerkleRoot()
    const accountsMerkleRoot = this.accountService.accountsMerkleRoot()

    const checkpointSignature = await this.sign(solUtils.keccak256FromStrings(txMerkleRoot, changesMerkleRoot, accountsMerkleRoot))

    console.log(`txMerkleRoot = ${txMerkleRoot}`)
    console.log(`changesMerkleRoot = ${changesMerkleRoot}`)
    console.log(`accountsMerkleRoot = ${accountsMerkleRoot}`)

    const tx = await this.plasmoidContract.makeCheckpoint(
      txMerkleRoot,
      changesMerkleRoot,
      accountsMerkleRoot,
      checkpointSignature + '01',
      { from: this.address })

    const eventArgs: PlasmoidWrapper.DidMakeCheckpoint = tx.logs[0].args
    const checkpointUid: BigNumber = eventArgs.id as BigNumber
    const checkpointObj = new Checkpoint(checkpointUid, txMerkleRoot, changesMerkleRoot, accountsMerkleRoot)
    this.accountService.addCheckpoint(checkpointObj)
    await this.accountService.sync()
    // const tx = {} as truffle.TransactionResult
    return tx
  }

  async transfer (channelId: BigNumber, addressA: string, addressB: string): Promise<truffle.TransactionResult> {
    // const transferDigest = await this.plasmoidContract.transferDigest(channelId, addressB)
    // const transferSignature = await this.sign(addressA, transferDigest)
    // const tx = await this.plasmoidContract.transfer(channelId, addressB, transferSignature + '01')
    const tx = {} as truffle.TransactionResult
    return tx
  }

  async startDispute (channelId: BigNumber, amount: BigNumber, checkpointId: BigNumber): Promise<truffle.TransactionResult> {
    // await this.accountService.updateTrees()
    // const channelIdAsBuffer = solUtils.bignumberToUint256(channelId)
    // const amountAsBuffer = solUtils.bignumberToUint256(amount)
    // const ownerAsBuffer = solUtils.stringToAddress(this.address)
    // const checkpointIdAsBuffer = solUtils.bignumberToUint256(checkpointId)
    //
    // const disputeRequestDigest = solUtils.keccak256(channelIdAsBuffer, amountAsBuffer, ownerAsBuffer, checkpointIdAsBuffer)
    // // console.log(`disputeRequestDigest = ${solUtils.bufferTo0xString(disputeRequestDigest)}`)
    // const disputeRequestSignature = await this.sign(disputeRequestDigest)
    // const disputeRequestSignatureAsString = util.addHexPrefix(disputeRequestSignature) + '01'
    // const concatenatedOwnersProofAsString: string = solUtils.bufferArrayTo0xString(this.accountService.ownersTree!.proof(util.sha3(this.address)))

    // const tx = await this.plasmoidContract.startDispute(channelId, amount, this.address, disputeRequestSignatureAsString, checkpointId, concatenatedOwnersProofAsString)
    const tx = {} as truffle.TransactionResult
    return tx
  }


  async answerDispute (plasmaState: PlasmaState, disputeRequestID: string, userAcceptanceSignature: string, acceptanceMerkleProof: string): Promise<truffle.TransactionResult> {
    // const tx = await this.plasmoidContract.answerDispute(plasmaState.channelId, plasmaState.amount, disputeRequestID, userAcceptanceSignature + '01', acceptanceMerkleProof)
    const tx = {} as truffle.TransactionResult
    return tx
  }

  async finalizeDispute (disputeRequestID: string): Promise<truffle.TransactionResult> {
    let tx = {} as truffle.TransactionResult
    // if (!disputeRequestID) {
    //   throw Error('disputeRequestID is undefined or null')
    // } else {
    //   tx = await this.plasmoidContract.finalizeDispute(disputeRequestID)
    // }

    return tx
  }
}
