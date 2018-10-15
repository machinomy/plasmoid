import { BigNumber } from 'bignumber.js'

export class Checkpoint {
  id: BigNumber
  txMerkleRoot: string
  changesMerkleRoot: string
  accountsMerkleRoot: string

  constructor (id: BigNumber, txMerkleRoot: string, changesMerkleRoot: string, accountsMerkleRoot: string) {
    this.id = id
    this.txMerkleRoot = txMerkleRoot
    this.changesMerkleRoot = changesMerkleRoot
    this.accountsMerkleRoot = accountsMerkleRoot
  }
}
