import { BigNumber } from 'bignumber.js'
import { Buffer } from 'safe-buffer'
import * as util from "ethereumjs-util"
import { Checkpoint } from './Checkpoint'
import { DepositTransaction } from './DepositTransaction'
import * as contracts from './index'
import MerkleTree from './MerkleTree'
import { Participant } from './Participant'
import { PlasmaState } from './PlasmaState'
import * as solUtils from './SolidityUtils'
import { Transaction } from './Transaction'
import { WithdrawalTransaction } from './WithdrawalTransaction'

export class AccountService {
  accountsState:        Map<string, PlasmaState>
  checkpoints:          Map<string, Checkpoint>
  deposits:             Array<DepositTransaction>
  participants:         Array<Participant>
  txArray:              Array<Transaction>
  txTree:               MerkleTree | undefined
  changes:              Map<BigNumber, BigNumber | undefined> | undefined
  changesTree:          MerkleTree | undefined
  accounts:             Map<BigNumber, string>
  accountsTree:         MerkleTree | undefined
  checkpointIdNext:     BigNumber
  plasmoidContract:     contracts.Plasmoid.Contract
  participantAddress:   string

  constructor (plasmoidContract: contracts.Plasmoid.Contract, participantAddress: string) {
    this.accountsState = new Map()
    this.participants = new Array()
    this.deposits = new Array()
    this.changes = new Map([])
    this.accounts = new Map([])
    this.txArray = new Array()
    this.checkpoints = new Map()
    this.checkpointIdNext = new BigNumber(2)
    this.plasmoidContract = plasmoidContract
    this.participantAddress = participantAddress
  }

  sync () {
    this.participants.map((party: Participant) => {
      if (party.address !== this.participantAddress) {
        party.accountService.changes = JSON.parse(JSON.stringify(this.changes))
      }
    })
  }

  addParticipant (participant: Participant): Participant {
    this.participants.push(participant)
    return participant
  }

  addDepositTransaction (owner: string, amount: BigNumber): DepositTransaction {
    const depositTransaction = new DepositTransaction(owner, amount)
    this.txArray.push(depositTransaction)
    return depositTransaction
  }

  addWithdrawalTransaction (owner: string, amount: BigNumber): WithdrawalTransaction {
    const withdrawalTransaction = new WithdrawalTransaction(owner, amount)
    this.txArray.push(withdrawalTransaction)
    return withdrawalTransaction
  }

  addChange (slotId: BigNumber, txId: BigNumber | undefined): void {
    this.changes!.set(slotId, txId)
    this.sync()
  }

  addAccountChange (slotId: BigNumber, account: string): void {
    this.accounts!.set(slotId, account)
  }

  getParticipantByAddress (address: string): Participant | undefined {
    const resArray = this.participants.filter(p => p.address === address)
    let result

    if (resArray.length > 0) {
      result = resArray[0]
    }

    return result
  }

  async updateTrees (): Promise<void> {
    // const accountHashesArray: Buffer[] = this.participants.map((party: Participant) => { return util.sha3(party.address) })

    const txArray: Buffer[] = this.participants.map((party: Participant) => {
      return solUtils.keccak256(solUtils.stringToAddress(party.address), solUtils.bignumberToUint256(party.plasmaState.amount))
    })

    this.txTree = new MerkleTree(txArray)

    const changesArray: Buffer[] = []

    // this.changes!.forEach((value: BigNumber | undefined, key: BigNumber) => {
    //   changesArray.push(solUtils.bignumberToBuffer(value || new BigNumber(0)))
    // })

    console.log('Changes: ')
    console.log(JSON.stringify(this.changes))

    if (this.changes) {
      for (let key of this.changes!.keys()) {
        changesArray.push(solUtils.bignumberToBuffer(this.changes!.get(key) || new BigNumber(0)))
      }
    }

    this.changesTree = new MerkleTree(changesArray)

    const accountsArray: Buffer[] = []

    console.log('Accounts: ')
    console.log(JSON.stringify(this.accounts))

    if (this.accounts) {
      for (let key of this.accounts.keys()) {
        accountsArray.push(solUtils.stringToBuffer(this.accounts!.get(key)!))
      }
    }

    this.accountsTree = new MerkleTree(accountsArray)

    // /// ??? TODO .toBuffer
    // // const stateMerkleRoot: string = util.addHexPrefix(this.stateTree.root.toString('hex'))
    //
    // // TODO We need to save raw signatures for dispute resolutions
    // const acceptanceSignaturesArray: Buffer[] = await Promise.all(this.participants.map(async (party: Participant) => { return solUtils.stringToBytes((await party.makeAcceptanceSignature())) }))
    // // console.log(JSON.stringify(acceptanceSignaturesArray))
    // const acceptanceSHA3HashesArray: Buffer[] = acceptanceSignaturesArray.map((e: Buffer) => {
    //   console.log(e.length)
    //   return util.sha3(e)
    // })

    // // solUtils.printBufferArrayAs0xString(acceptanceSignaturesArray)
    //
    // // console.log(JSON.stringify(acceptanceSignaturesArray))
    // this.stateAcceptanceTree = new MerkleTree(acceptanceSHA3HashesArray)
    // // const acceptanceMerkleRoot: string = util.addHexPrefix(this.acceptanceTree.root.toString('hex'))
    //
    // this.ownersTree = new MerkleTree(accountHashesArray)
    // // const ownersMerkleRoot = util.addHexPrefix(this.ownersTree.root.toString('hex'))
    //
    // const ownersAcceptanceHashesArray: Buffer[] = await Promise.all(this.participants.map(async (party: Participant) => { return util.toBuffer(await party.makeOwnersAcceptanceSignature(this.checkpointIdNext, this.ownersTreeRoot())) }))
    // const ownersAcceptanceSHA3HashesArray: Buffer[] = ownersAcceptanceHashesArray.map((e: Buffer) => util.sha3(e))
    // this.ownersAcceptanceTree = new MerkleTree(ownersAcceptanceSHA3HashesArray)
  }

  addCheckpoint (checkpoint: Checkpoint) {
    this.checkpoints.set(checkpoint.id.toString(), checkpoint)
  }

  txMerkleRoot (): string {
    return util.addHexPrefix(this.txTree!.root.toString('hex'))
  }

  changesMerkleRoot (): string {
    return util.addHexPrefix(this.changesTree!.root.toString('hex'))
  }

  accountsMerkleRoot (): string {
    return util.addHexPrefix(this.accountsTree!.root.toString('hex'))
  }

  // async lastSlotID (): Promise<BigNumber> {
  //   return this.plasmoidContract.
  // }
}
