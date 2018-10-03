import { BigNumber } from 'bignumber.js'
import { Buffer } from 'safe-buffer'
import * as util from "ethereumjs-util"
import { Checkpoint } from './Checkpoint'
import MerkleTree from './MerkleTree'
import { Participant } from './Participant'
import { PlasmaState } from './PlasmaState'
import * as solUtils from './SolidityUtils'

export class AccountService {
  accountsState:        Map<string, PlasmaState>
  checkpoints:          Map<string, Checkpoint>
  participants:         Array<Participant>
  stateTree:            MerkleTree | undefined
  stateAcceptanceTree:  MerkleTree | undefined
  ownersTree:           MerkleTree | undefined
  ownersAcceptanceTree: MerkleTree | undefined
  checkpointIdNext:     BigNumber

  constructor () {
    this.accountsState = new Map()
    this.participants = new Array()
    this.checkpoints = new Map()
    this.checkpointIdNext = new BigNumber(2)
  }

  addParticipant (participant: Participant): Participant {
    this.participants.push(participant)
    return participant
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
    const accountHashesArray: Buffer[] = this.participants.map((party: Participant) => { return util.sha3(party.address) })
    this.stateTree = new MerkleTree(accountHashesArray)
    /// ??? TODO .toBuffer
    // const stateMerkleRoot: string = util.addHexPrefix(this.stateTree.root.toString('hex'))

    // TODO We need to save raw signatures for dispute resolutions
    const acceptanceSignaturesArray: Buffer[] = await Promise.all(this.participants.map(async (party: Participant) => { return solUtils.stringToBytes((await party.makeAcceptanceSignature())) }))
    // console.log(JSON.stringify(acceptanceSignaturesArray))
    const acceptanceSHA3HashesArray: Buffer[] = acceptanceSignaturesArray.map((e: Buffer) => {
      console.log(e.length)
      return util.sha3(e)
    })

    // solUtils.printBufferArrayAs0xString(acceptanceSignaturesArray)

    // console.log(JSON.stringify(acceptanceSignaturesArray))
    this.stateAcceptanceTree = new MerkleTree(acceptanceSHA3HashesArray)
    // const acceptanceMerkleRoot: string = util.addHexPrefix(this.acceptanceTree.root.toString('hex'))

    this.ownersTree = new MerkleTree(accountHashesArray)
    // const ownersMerkleRoot = util.addHexPrefix(this.ownersTree.root.toString('hex'))

    const ownersAcceptanceHashesArray: Buffer[] = await Promise.all(this.participants.map(async (party: Participant) => { return util.toBuffer(await party.makeOwnersAcceptanceSignature(this.checkpointIdNext, this.ownersTreeRoot())) }))
    const ownersAcceptanceSHA3HashesArray: Buffer[] = ownersAcceptanceHashesArray.map((e: Buffer) => util.sha3(e))
    this.ownersAcceptanceTree = new MerkleTree(ownersAcceptanceSHA3HashesArray)
  }

  stateTreeRoot (): string {
    return util.addHexPrefix(this.stateTree!.root.toString('hex'))
  }

  stateAcceptanceTreeRoot (): string {
    return util.addHexPrefix(this.stateAcceptanceTree!.root.toString('hex'))
  }

  ownersTreeRoot (): string {
    return util.addHexPrefix(this.ownersTree!.root.toString('hex'))
  }

  ownersAcceptanceTreeRoot (): string {
    return util.addHexPrefix(this.ownersAcceptanceTree!.root.toString('hex'))
  }

  addCheckpoint (checkpoint: Checkpoint) {
    this.checkpoints.set(checkpoint.id.toString(), checkpoint)
  }
}
