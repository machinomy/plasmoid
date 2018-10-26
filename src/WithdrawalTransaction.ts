import { BigNumber } from 'bignumber.js'
import { Buffer } from 'safe-buffer'
import * as solUtils from './SolidityUtils'
import { ERC20Transaction } from './ERC20Transaction'

const numberToBN = require('number-to-bn')

export class WithdrawalTransaction extends ERC20Transaction {
  constructor (lock: string | undefined, amount: BigNumber | undefined) {
    super('w', lock, amount)
  }

  transactionDigest (): Buffer {
    return solUtils.keccak256(solUtils.stringToBytes(this.mnemonic), solUtils.stringToBytes(this.lock), solUtils.bignumberToUint256(this.amount))
  }
}
