import { BigNumber } from 'bignumber.js'

export class Checkpoint {
  id: BigNumber
  stateTreeRoot: string
  stateAcceptanceTreeRoot: string
  ownersTreeRoot: string
  ownersAcceptanceTreeRoot: string

  constructor (id: BigNumber, stateTreeRoot: string, stateAcceptanceTreeRoot: string, ownersTreeRoot: string, ownersAcceptanceTreeRoot: string ) {
    this.id = id
    this.stateTreeRoot = stateTreeRoot
    this.stateAcceptanceTreeRoot = stateAcceptanceTreeRoot
    this.ownersTreeRoot = ownersTreeRoot
    this.ownersAcceptanceTreeRoot = ownersAcceptanceTreeRoot
  }
}
