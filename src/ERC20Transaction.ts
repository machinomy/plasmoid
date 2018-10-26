import { BigNumber } from 'bignumber.js'
import { Buffer } from 'safe-buffer'
import * as solUtils from './SolidityUtils'

const numberToBN = require('number-to-bn')

export class ERC20Transaction {
  mnemonic: string
  lock: string
  amount: BigNumber

  constructor (mnemonic: string | undefined, lock: string | undefined, amount: BigNumber | undefined) {
    this.mnemonic = mnemonic ? mnemonic : ''
    this.lock = lock ? lock : ''
    this.amount = amount ? amount : new BigNumber(-1)
  }

  type (): string {
    return this.mnemonic
  }
}
