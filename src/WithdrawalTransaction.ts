import { BigNumber } from 'bignumber.js'
import { Buffer } from 'safe-buffer'
import * as solUtils from './SolidityUtils'
import { Transaction } from './Transaction'

const numberToBN = require('number-to-bn')

export class WithdrawalTransaction extends Transaction {
  amount: BigNumber
  lock: string

  constructor (lock: string | undefined, amount: BigNumber | undefined) {
    super('w')
    this.amount = amount ? amount : new BigNumber(-1)
    this.lock = lock ? lock : ''
  }

  transactionDigest (): Buffer {
    return solUtils.keccak256(solUtils.stringToBytes(this.mnemonic), solUtils.stringToBytes(this.lock), solUtils.bignumberToUint256(this.amount))
  }
}
