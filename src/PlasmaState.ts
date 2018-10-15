import { BigNumber } from 'bignumber.js'
import { Buffer } from 'safe-buffer'
import * as solUtils from './SolidityUtils'

const numberToBN = require('number-to-bn')

export class PlasmaState {
  slotID: BigNumber
  amount: BigNumber
  owner: string

  constructor (slotID: BigNumber | undefined, amount: BigNumber | undefined, owner: string | undefined) {
    this.slotID = slotID ? slotID : new BigNumber(-1)
    this.amount = amount ? amount : new BigNumber(-1)
    this.owner = owner ? owner : ''
  }

  toBuffer (): Buffer {
    const slotIDBuffer = solUtils.bignumberToUint256(this.slotID)
    const amountBuffer = solUtils.bignumberToUint256(this.amount)
    const ownerBuffer = solUtils.stringToAddress(this.owner)
    return Buffer.concat([slotIDBuffer, amountBuffer, ownerBuffer])
  }
}
