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
  txs:                  Array<Transaction>
  txTree:               MerkleTree | undefined
  changes:              Map<string, BigNumber>
  changesTree:          MerkleTree | undefined
  accounts:             Map<string, Buffer>
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
    this.txs = new Array()
    this.checkpoints = new Map()
    this.checkpointIdNext = new BigNumber(2)
    this.plasmoidContract = plasmoidContract
    this.participantAddress = participantAddress.toLowerCase()
  }

  async sync () {
    for (let party of this.participants) {
      if (party.address !== this.participantAddress) {
        party.accountService.changes = new Map(this.changes)
        party.accountService.accounts = new Map(this.accounts)
        party.accountService.txs = [...this.txs]
        await party.accountService.updateTrees()
      }
    }
    await this.updateTrees()
  }

  addParticipant (participant: Participant): Participant {
    this.participants.push(participant)
    return participant
  }

  async addDepositTransaction (owner: string, amount: BigNumber): Promise<DepositTransaction> {
    const depositTransaction = new DepositTransaction(owner, amount)
    this.txs.push(depositTransaction)
    await this.sync()
    return depositTransaction
  }

  async addWithdrawalTransaction (owner: string, amount: BigNumber): Promise<WithdrawalTransaction> {
    const withdrawalTransaction = new WithdrawalTransaction(owner, amount)
    this.txs.push(withdrawalTransaction)
    await this.sync()
    return withdrawalTransaction
  }

  async addChange (slotId: BigNumber, txId: BigNumber): Promise<void> {
    this.changes!.set(slotId.toString(), txId)
    await this.sync()
  }

  async addAccountChange (slotId: BigNumber, account: string, amount: BigNumber): Promise<void> {
    this.accounts.set(slotId.toString(), Buffer.concat([solUtils.stringToBuffer(account), solUtils.bignumberToUint256(amount)]))
    await this.sync()
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
    const txArray: Buffer[] = this.txs.map((tx: Transaction) => {
      let result = new Buffer('')
      switch (tx.type()) {
        case 'w': result = (tx as WithdrawalTransaction).transactionDigest()
          break
        case 'd': result = (tx as DepositTransaction).transactionDigest()
          break
      }
      return result
    })

    this.txTree = new MerkleTree(txArray)

    const changesArray: Buffer[] = []

    if (this.changes.size) {
      for (let key of this.changes.keys()) {
        const newElement = solUtils.keccak256(solUtils.bignumberToUint256(new BigNumber(this.changes!.get(key) || 0)))
        changesArray.push(newElement)
      }
    }


    this.changesTree = new MerkleTree(changesArray)

    const accountsArray: Buffer[] = []

    if (this.accounts.size) {
      for (let key of this.accounts.keys()) {
        accountsArray.push(solUtils.keccak256(this.accounts.get(key)!))
      }
    }

    this.accountsTree = new MerkleTree(accountsArray)
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
