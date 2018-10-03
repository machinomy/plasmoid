import { BigNumber } from 'bignumber.js'
import { Buffer } from 'safe-buffer'
import * as solUtils from './SolidityUtils'

const numberToBN = require('number-to-bn')

export class PlasmaState {
  channelId: BigNumber
  amount: BigNumber
  owner: string

  constructor (channelId: BigNumber | undefined, amount: BigNumber | undefined, owner: string | undefined) {
    this.channelId = channelId ? channelId : new BigNumber(-1)
    this.amount = amount ? amount : new BigNumber(-1)
    this.owner = owner ? owner : ''
  }

  toBuffer (): Buffer {
    const channelIdBuffer = solUtils.bignumberToUint256(this.channelId)
    const amountBuffer = solUtils.bignumberToUint256(this.amount)
    const ownerBuffer = solUtils.stringToAddress(this.owner)
    return Buffer.concat([channelIdBuffer, amountBuffer, ownerBuffer])
  }
}
