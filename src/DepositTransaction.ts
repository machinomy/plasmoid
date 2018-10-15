import { BigNumber } from 'bignumber.js'
import { Buffer } from 'safe-buffer'
import * as solUtils from './SolidityUtils'
import { Transaction } from './Transaction'

const numberToBN = require('number-to-bn')

export class DepositTransaction extends Transaction {
  lock: string
  amount: BigNumber

  constructor (lock: string | undefined, amount: BigNumber | undefined) {
    super('d')
    this.amount = amount ? amount : new BigNumber(-1)
    this.lock = lock ? lock : ''
  }

}
