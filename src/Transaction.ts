import { BigNumber } from 'bignumber.js'
import { Buffer } from 'safe-buffer'
import * as solUtils from './SolidityUtils'

const numberToBN = require('number-to-bn')

export class Transaction {
  mnemonic: string

  constructor (mnemonic: string | undefined) {
    this.mnemonic = mnemonic ? mnemonic : ''
  }
}
