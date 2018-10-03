import * as util from 'ethereumjs-util'
import * as contracts from './index'
import { BigNumber } from 'bignumber.js'
import TestToken from '../build/wrappers/TestToken'
import PlasmoidWrapper from '../build/wrappers/Plasmoid'
import MerkleTree from './MerkleTree'
import { Buffer } from 'safe-buffer'
import Logger from '@machinomy/logger'
import * as Web3  from 'web3'
import { PlasmaState } from './PlasmaState'
import { Participant } from './Participant'
import { AccountService } from './AccountService'
import * as solUtils from './SolidityUtils'


const Plasmoid = artifacts.require<contracts.Plasmoid.Contract>('Plasmoid.sol')
const MintableToken = artifacts.require<TestToken.Contract>('TestToken.sol')

const MINTED = new BigNumber(1000)
const VALUE = new BigNumber(100)

const LOG = new Logger('plasmoid')

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))

let accountsState: Map<string, PlasmaState> = new Map()


contract('Plasmoid', accounts => {
  const TOKEN_OWNER: string = accounts[0]
  const PLASMOID_OWNER: string = accounts[4]

  const ALICE: string = accounts[1]
  const BOB: string = accounts[2]
  const ALIEN: string = accounts[3]

  LOG.info(`ALICE: ${ALICE}`)
  LOG.info(`BOB: ${BOB}`)

  let mintableToken: TestToken.Contract
  let plasmoid: contracts.Plasmoid.Contract

  beforeEach(async () => {
    mintableToken = await MintableToken.new({ from: TOKEN_OWNER })
    plasmoid = await Plasmoid.new(mintableToken.address, { from: PLASMOID_OWNER })

    await mintableToken.mint(ALICE, MINTED, { from: TOKEN_OWNER })
    await mintableToken.finishMinting({ from: TOKEN_OWNER })
  })

  describe('Dispute', () => {
    let channelId: BigNumber

    beforeEach(async () => {
      await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args
      channelId = eventArgs.channelId as BigNumber

      accountsState.clear()
      accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(100), ALICE))
      accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(0), BOB))
    })

    // test('User starts a dispute and operator do not answer him', async (done) => {
    //   let accountHashesArray: Buffer[] = []
    //
    //   const accountServiceOperator = new AccountService()
    //   const accountServiceAtAlice = new AccountService()
    //   const accountServiceAtBob = new AccountService()
    //
    //   const aliceAsParty: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, channelId, new BigNumber(90))
    //   const bobAsParty: Participant = new Participant(BOB, plasmoid, accountServiceAtBob, channelId, new BigNumber(10))
    //   const operatorAsParty: Participant = new Participant(PLASMOID_OWNER, plasmoid, accountServiceOperator, channelId, new BigNumber(0))
    //
    //   accountServiceOperator.addParticipant(aliceAsParty)
    //   accountServiceOperator.addParticipant(bobAsParty)
    //   accountServiceOperator.addParticipant(operatorAsParty)
    //
    //   accountServiceAtAlice.addParticipant(aliceAsParty)
    //   accountServiceAtAlice.addParticipant(bobAsParty)
    //   accountServiceAtAlice.addParticipant(operatorAsParty)
    //
    //   accountServiceAtBob.addParticipant(aliceAsParty)
    //   accountServiceAtBob.addParticipant(bobAsParty)
    //   accountServiceAtBob.addParticipant(operatorAsParty)
    //
    //   await plasmoid.setSettlingPeriod(1)
    //
    //   const txCheckpoint = await operatorAsParty.makeCheckpoint()
    //   // FIXME method updateCheckpoint map on others
    //   const checkpointId: BigNumber = (txCheckpoint.logs[0].args as PlasmoidWrapper.DidCheckpoint).checkpointId as BigNumber
    //   await operatorAsParty.transfer(channelId, ALICE, BOB)
    //
    //   const txDispute = await bobAsParty.startDispute(channelId, new BigNumber(2000), checkpointId)
    //   const eventArgsAddToDispute: PlasmoidWrapper.DidAddToDisputeQueue = txDispute.logs[0].args
    //
    //   setTimeout(async () => {
    //     const tx4 = await bobAsParty.finalizeDispute(eventArgsAddToDispute.disputeRequestID)
    //     expect(tx4.logs[0] && PlasmoidWrapper.isDidFinalizeDisputeEvent(tx4.logs[0])).toBeTruthy()
    //     done()
    //   }, 2500)
    // })

    test('User starts a dispute and operator has a correct data for answer', async () => {
      // Account service at Alice Machine
      const accountServiceAtAlice = new AccountService()
      // Account service at Bob Machine
      const accountServiceAtBob = new AccountService()
      // Account service at Operator Machine
      const accountServiceAtOperator = new AccountService()


      // Alice user at Alice Machine
      const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, channelId, new BigNumber(90))
      // Bob user at Alice Machine
      const bobAsPartyAtAlice: Participant = new Participant(BOB, plasmoid, accountServiceAtBob, channelId, new BigNumber(10))
      // Operator user at Alice Machine
      const operatorAsPartyAtAlice: Participant = new Participant(PLASMOID_OWNER, plasmoid, accountServiceAtOperator, channelId, new BigNumber(0))

      // Alice user at Bob Machine
      const aliceAsPartyAtBob: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, channelId, new BigNumber(90))
      // Bob user at Bob Machine
      const bobAsPartyAtBob: Participant = new Participant(BOB, plasmoid, accountServiceAtBob, channelId, new BigNumber(10))
      // Operator user at Bob Machine
      const operatorAsPartyAtBob: Participant = new Participant(PLASMOID_OWNER, plasmoid, accountServiceAtOperator, channelId, new BigNumber(0))

      // Alice user at Operator Machine
      const aliceAsPartyAtOperator: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, channelId, new BigNumber(90))
      // Bob user at Operator Machine
      const bobAsPartyAtOperator: Participant = new Participant(BOB, plasmoid, accountServiceAtBob, channelId, new BigNumber(10))
      // Operator user at Operator Machine
      const operatorAsPartyAtOperator: Participant = new Participant(PLASMOID_OWNER, plasmoid, accountServiceAtOperator, channelId, new BigNumber(0))

      accountServiceAtOperator.addParticipant(aliceAsPartyAtOperator)
      accountServiceAtOperator.addParticipant(bobAsPartyAtOperator)
      accountServiceAtOperator.addParticipant(operatorAsPartyAtOperator)

      accountServiceAtAlice.addParticipant(aliceAsPartyAtAlice)
      accountServiceAtAlice.addParticipant(bobAsPartyAtAlice)
      accountServiceAtAlice.addParticipant(operatorAsPartyAtAlice)

      accountServiceAtBob.addParticipant(aliceAsPartyAtBob)
      accountServiceAtBob.addParticipant(bobAsPartyAtBob)
      accountServiceAtBob.addParticipant(operatorAsPartyAtBob)

      const txCheckpoint = await operatorAsPartyAtOperator.makeCheckpoint()
      // FIXME method updateCheckpoint map on others
      const checkpointId: BigNumber = (txCheckpoint.logs[0].args as PlasmoidWrapper.DidCheckpoint).checkpointId as BigNumber
      await operatorAsPartyAtOperator.transfer(channelId, ALICE, BOB)

      const txStartDispute = await bobAsPartyAtBob.startDispute(channelId, new BigNumber(2000), checkpointId)
      const eventArgsAddToDispute: PlasmoidWrapper.DidAddToDisputeQueue = txStartDispute.logs[0].args

      const bob = accountServiceAtOperator.getParticipantByAddress(BOB)!
      const acceptanceSignatureForBob = await bob.makeAcceptanceSignature()
      // console.log(acceptanceSignatureForBob)
      const keccakkedAcceptanceSignatureForBob = solUtils.keccak256(stringToBytes(acceptanceSignatureForBob))

      // console.log(`acceptanceSignatureForBob = ${acceptanceSignatureForBob}`)
      // console.log(`keccakkedAcceptanceSignatureForBob = ${solUtils.bytes32To0xString(keccakkedAcceptanceSignatureForBob)}`)

      // console.log(solUtils.bufferTo0xString(keccakkedAcceptanceSignatureForBob))
      // console.log(JSON.stringify(keccakkedAcceptanceSignatureForBob))
      // console.log(JSON.stringify(accountServiceAtOperator.stateAcceptanceTree!))
      const acceptanceProofsForBob = accountServiceAtOperator.stateAcceptanceTree!.proof(keccakkedAcceptanceSignatureForBob)

      // acceptanceProofsForBob.map(el => console.log(solUtils.bufferTo0xString(el)))

      // console.log(`acceptanceSignatureForBob = ${acceptanceSignatureForBob}`)
      const txAnswerDispute = await operatorAsPartyAtOperator.answerDispute(bob.plasmaState,
        eventArgsAddToDispute.disputeRequestID,
        acceptanceSignatureForBob,
        solUtils.bufferArrayTo0xString(acceptanceProofsForBob))

      PlasmoidWrapper.printEvents(txAnswerDispute)
      expect(txAnswerDispute.logs[0] && PlasmoidWrapper.isDidAnswerDisputeEvent(txAnswerDispute.logs[0])).toBeTruthy()
    })

    // test('User did taking a part in checkpoint and operator put not valid digest', async (done) => {
    //   let accountHashesArray: Buffer[] = []
    //
    //   const accountServiceOperator = new AccountService()
    //   const accountServiceAtAlice = new AccountService()
    //   const accountServiceAtBob = new AccountService()
    //
    //   const aliceAsParty: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, channelId, new BigNumber(90))
    //   const bobAsParty: Participant = new Participant(BOB, plasmoid, accountServiceAtBob, channelId, new BigNumber(10))
    //   const operatorAsParty: Participant = new Participant(PLASMOID_OWNER, plasmoid, accountServiceOperator, channelId, new BigNumber(0))
    //
    //   accountServiceOperator.addParticipant(aliceAsParty)
    //   accountServiceOperator.addParticipant(bobAsParty)
    //   accountServiceOperator.addParticipant(operatorAsParty)
    //
    //   accountServiceAtAlice.addParticipant(aliceAsParty)
    //   accountServiceAtAlice.addParticipant(bobAsParty)
    //   accountServiceAtAlice.addParticipant(operatorAsParty)
    //
    //   accountServiceAtBob.addParticipant(aliceAsParty)
    //   accountServiceAtBob.addParticipant(bobAsParty)
    //   accountServiceAtBob.addParticipant(operatorAsParty)
    //
    //   await plasmoid.setSettlingPeriod(1)
    //
    //   const txCheckpoint = await operatorAsParty.makeCheckpoint()
    //   // FIXME method updateCheckpoint map on others
    //   const checkpointId: BigNumber = (txCheckpoint.logs[0].args as PlasmoidWrapper.DidCheckpoint).checkpointId as BigNumber
    //   await operatorAsParty.transfer(channelId, ALICE, BOB)
    //
    //   const txDispute = await bobAsParty.startDispute(channelId, new BigNumber(2000), checkpointId)
    //   const eventArgsAddToDispute: PlasmoidWrapper.DidAddToDisputeQueue = txDispute.logs[0].args
    //
    //   setTimeout(async () => {
    //     const tx4 = await bobAsParty.finalizeDispute(eventArgsAddToDispute.disputeRequestID)
    //     expect(tx4.logs[0] && PlasmoidWrapper.isDidFinalizeDisputeEvent(tx4.logs[0])).toBeTruthy()
    //     done()
    //   }, 2500)
    // })

    // test('User did NOT taking a part in checkpoint and wants to create dispute', async (done) => {
    //   let accountHashesArray: Buffer[] = []
    //
    //   accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(90), ALICE))
    //   accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(10), BOB))
    //   accountsState.set(ALIEN, new PlasmaState(channelId, new BigNumber(0), ALIEN))
    //
    //   const digest11: Buffer = makeStateDigest(ALICE)
    //   const digest12: Buffer = makeStateDigest(BOB)
    //   accountHashesArray.push(digest11)
    //   accountHashesArray.push(digest12)
    //
    //   await plasmoid.setSettlingPeriod(1)
    //
    //   let stateTree = new MerkleTree(accountHashesArray)
    //   const stateMerkleRoot: string = util.addHexPrefix(stateTree.root.toString('hex'))
    //
    //   // START User-side ALICE
    //   let acceptanceDigestAlice: string = util.addHexPrefix(makeAcceptanceDigest(ALICE).toString('hex'))
    //   let acceptanceDigestFromBlockchainAlice = await plasmoid.acceptCurrentStateDigest(accountsState.get(ALICE)!.channelId, accountsState.get(ALICE)!.amount, accountsState.get(ALICE)!.owner)
    //   expect(acceptanceDigestFromBlockchainAlice).toEqual(acceptanceDigestAlice)
    //   let acceptanceSignatureAlice = await sign(ALICE, acceptanceDigestAlice)
    //   // END User-side ALICE
    //
    //   // START User-side BOB
    //   let acceptanceDigestBob: string = util.addHexPrefix(makeAcceptanceDigest(BOB).toString('hex'))
    //   let acceptanceDigestFromBlockchainBob = await plasmoid.acceptCurrentStateDigest(accountsState.get(BOB)!.channelId, accountsState.get(BOB)!.amount, accountsState.get(BOB)!.owner)
    //   expect(acceptanceDigestFromBlockchainBob).toEqual(acceptanceDigestBob)
    //   let acceptanceSignatureBob = await sign(BOB, acceptanceDigestBob)
    //   // END User-side BOB
    //
    //   let acceptanceTree = new MerkleTree([util.sha3(acceptanceSignatureAlice), util.sha3(acceptanceSignatureBob)])
    //   const acceptanceMerkleRoot: string = util.addHexPrefix(acceptanceTree.root.toString('hex'))
    //
    //   let ownersTree = new MerkleTree([util.sha3(ALICE), util.sha3(BOB)])
    //   const ownersMerkleRootAsBuffer = ownersTree.root
    //   const ownersMerkleRoot = util.addHexPrefix(ownersTree.root.toString('hex'))
    //
    //   // START Person that makes a checkpoint side
    //   let checkpointIdNow: BigNumber = await plasmoid.checkpointIdNow()
    //   let checkpointIdNext = checkpointIdNow.plus(1)
    //
    //   let stateSignatureCheckpointer = await sign(PLASMOID_OWNER, stateMerkleRoot)
    //   let acceptanceSignatureCheckpointer = await sign(PLASMOID_OWNER, acceptanceMerkleRoot)
    //   const ownersMerkleRootAndCheckpointId = Buffer.concat([ownersMerkleRootAsBuffer, util.toBuffer(numberToBN(checkpointIdNext))]).toString('hex')
    //   let ownersSignatureCheckpointer = await sign(PLASMOID_OWNER, ownersMerkleRootAndCheckpointId)
    //
    //   let ownersProofsForAlice = ownersTree.proof(util.sha3(ALICE))
    //
    //   // Sends ownersMerkleRootAsBuffer,checkpointIdNext, ownersSignatureCheckpointer and ownersProofsForAlice to ALICE
    //
    //   // START ALICE-side
    //   const recoveredCheckpointerAddress = recover(ownersSignatureCheckpointer, Buffer.concat([ownersMerkleRootAsBuffer, util.toBuffer(numberToBN(checkpointIdNext))]))
    //   const verifiedProofs = ownersTree.verify(ownersProofsForAlice, util.sha3(ALICE))
    //   expect(recoveredCheckpointerAddress).toEqual(PLASMOID_OWNER)
    //   expect(verifiedProofs).toBeTruthy()
    //
    //   let ownersSignatureAlice = await sign(ALICE, ownersMerkleRootAndCheckpointId)
    //   let checkpointIdNextFromAlice = checkpointIdNext
    //   let ownersMerkleRootAsBufferFromAlice =  ownersMerkleRootAsBuffer
    //   // END ALICE-side
    //
    //   // Alice sends ownersMerkleRootAsBuffer, checkpointIdNext, ownersSignatureAlice back to Operator
    //
    //   // START Operator-side
    //   const recoveredAddressFromAlice = recover(ownersSignatureAlice, Buffer.concat([ownersMerkleRootAsBufferFromAlice, util.toBuffer(numberToBN(checkpointIdNextFromAlice))]))
    //   expect(checkpointIdNextFromAlice).toEqual(checkpointIdNext)
    //   expect(util.sha3(ownersMerkleRootAsBufferFromAlice)).toEqual(util.sha3(ownersMerkleRootAsBuffer))
    //   expect(recoveredAddressFromAlice).toEqual(ALICE)
    //   // END Operator-side
    //
    //   // const recoveredAddress = recover(signature, statMerkleRoot)
    //
    //   // Do the first checkpoint
    //   const tx = await plasmoid.checkpoint(stateMerkleRoot, acceptanceMerkleRoot, ownersMerkleRoot, stateSignatureCheckpointer, acceptanceSignatureCheckpointer, ownersSignatureCheckpointer, { from: PLASMOID_OWNER })
    //   console.log(JSON.stringify(tx.logs))
    //   const eventArgs: PlasmoidWrapper.DidCheckpoint = tx.logs[0].args
    //   const checkpointUid = eventArgs.checkpointId as BigNumber
    //   // END Person that makes a checkpoint side
    //
    //   // const concat: Buffer = Buffer.concat(merkleProof2)
    //   // const concatenatedProofAsString: string = util.addHexPrefix(Buffer.concat(stateTree.proof(digest22)).toString('hex'))
    //
    //   // Do transfer ownership of channel from ALICE to BOB
    //   const transferDigest = await plasmoid.transferDigest(channelId, BOB)
    //   const transferSignature = await sign(ALICE, transferDigest)
    //   await plasmoid.transfer(channelId, BOB, transferSignature)
    //
    //
    //   // Data Signature is Buffer.from channelId, amount, owner, checkpointId
    //   // const dataDigest = Buffer.concat([accountsState.get(BOB)!.toBuffer(), util.setLengthLeft((util.toBuffer(numberToBN(checkpointUid))), 32)]).toString('hex')
    //   const dataDigest = util.addHexPrefix(util.sha3(accountsState.get(ALIEN)!.toBuffer()).toString('hex'))
    //   const dataSignature = await sign(ALIEN, dataDigest)
    //   const dataSignatureAsString = util.addHexPrefix(dataSignature)
    //   const concatenatedOwnersProofAsString2: string = util.addHexPrefix(Buffer.concat(ownersTree.proof(util.sha3(BOB))).toString('hex'))
    //
    //   const proposedChannelID: BigNumber = new BigNumber(accountsState.get(ALIEN)!.channelId)
    //   console.log(`proposedChannelID = ${proposedChannelID.toString()}`)
    //   const proposedAmount: BigNumber = new BigNumber(accountsState.get(ALIEN)!.amount)
    //   console.log(`proposedAmount = ${proposedAmount.toString()}`)
    //   const proposedOwner: string = accountsState.get(ALIEN)!.owner
    //   console.log(`proposedOwner = ${proposedOwner}`)
    //   console.log(`dataSignatureAsString = ${dataSignatureAsString}`)
    //   console.log(`checkpointUid = ${checkpointUid.toString()}`)
    //   console.log(`concatenatedOwnersProofAsString2 = ${concatenatedOwnersProofAsString2}`)
    //   console.log(`dataDigest = ${dataDigest}`)
    //   const tx3 = await plasmoid.startDispute(proposedChannelID, proposedAmount, proposedOwner, dataSignatureAsString, checkpointUid, concatenatedOwnersProofAsString2)
    //   PlasmoidWrapper.printEvents(tx3)
    //   const eventArgsAddToDispute: PlasmoidWrapper.DidAddToDisputeQueue = tx3.logs[0].args
    //
    //   setTimeout(async () => {
    //     const tx4 = await plasmoid.finalizeDispute(eventArgsAddToDispute.disputeRequestID)
    //     expect(tx4.logs[0] && PlasmoidWrapper.isDidFinalizeDisputeEvent(tx4.logs[0])).toBeTruthy()
    //     done()
    //   }, 2500)
    // })
  })
  //
  // describe('withdrawal with checkpoints', () => {
  //   let channelId: BigNumber
  //
  //   beforeEach(async () => {
  //     await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
  //     const tx = await plasmoid.deposit(VALUE, { from: ALICE })
  //     const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args
  //     channelId = eventArgs.channelId as BigNumber
  //
  //     accountsState.clear()
  //     accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(100), ALICE))
  //     accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(0), BOB))
  //   })

    // test('usual case', async (done) => {
    //   let accountHashesArray: Buffer[] = []
    //
    //   accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(90), ALICE))
    //   accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(10), BOB))
    //
    //   const digest11: Buffer = makeStateDigest(ALICE)
    //   const digest12: Buffer = makeStateDigest(BOB)
    //   accountHashesArray.push(digest11)
    //   accountHashesArray.push(digest12)
    //
    //   await plasmoid.setSettlingPeriod(1)
    //
    //   let stateTree = new MerkleTree(accountHashesArray)
    //   const stateMerkleRoot: string = util.addHexPrefix(stateTree.root.toString('hex'))
    //
    //   // START User-side ALICE
    //   let acceptanceDigestAlice: string = util.addHexPrefix(makeAcceptanceDigest(ALICE).toString('hex'))
    //   let acceptanceDigestFromBlockchainAlice = await plasmoid.acceptCurrentStateDigest(accountsState.get(ALICE)!.channelId, accountsState.get(ALICE)!.amount, accountsState.get(ALICE)!.owner)
    //   expect(acceptanceDigestFromBlockchainAlice).toEqual(acceptanceDigestAlice)
    //   let acceptanceSignatureAlice = await sign(ALICE, acceptanceDigestAlice)
    //   // END User-side ALICE
    //
    //   // START User-side BOB
    //   let acceptanceDigestBob: string = util.addHexPrefix(makeAcceptanceDigest(BOB).toString('hex'))
    //   let acceptanceDigestFromBlockchainBob = await plasmoid.acceptCurrentStateDigest(accountsState.get(BOB)!.channelId, accountsState.get(BOB)!.amount, accountsState.get(BOB)!.owner)
    //   expect(acceptanceDigestFromBlockchainBob).toEqual(acceptanceDigestBob)
    //   let acceptanceSignatureBob = await sign(BOB, acceptanceDigestBob)
    //   // END User-side BOB
    //
    //   let acceptanceTree = new MerkleTree([util.sha3(acceptanceSignatureAlice), util.sha3(acceptanceSignatureBob)])
    //   const acceptanceMerkleRoot: string = util.addHexPrefix(acceptanceTree.root.toString('hex'))
    //
    //   let ownersTree = new MerkleTree([util.sha3(ALICE), util.sha3(BOB)])
    //   const ownersMerkleRoot = util.addHexPrefix(ownersTree.root.toString('hex'))
    //
    //   // START Person that makes a checkpoint side
    //   let stateSignatureCheckpointer = await sign(PLASMOID_OWNER, stateMerkleRoot)
    //   let acceptanceSignatureCheckpointer = await sign(PLASMOID_OWNER, acceptanceMerkleRoot)
    //   let ownersSignatureCheckpointer = await sign(PLASMOID_OWNER, ownersMerkleRoot)
    //   // const recoveredAddress = recover(signature, statMerkleRoot)
    //
    //   // Do the first checkpoint
    //   const tx = await plasmoid.checkpoint(stateMerkleRoot, acceptanceMerkleRoot, ownersMerkleRoot, stateSignatureCheckpointer, acceptanceSignatureCheckpointer, ownersSignatureCheckpointer, { from: PLASMOID_OWNER })
    //   console.log(JSON.stringify(tx.logs))
    //   const eventArgs: PlasmoidWrapper.DidCheckpoint = tx.logs[0].args
    //   const checkpointUid = eventArgs.checkpointId as BigNumber
    //   // END Person that makes a checkpoint side
    //
    //
    //
    //
    //
    //
    //
    //
    //   accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(0), ALICE))
    //   accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(100), BOB))
    //
    //   accountHashesArray = []
    //   const digest21: Buffer = makeStateDigest(ALICE)
    //   const digest22: Buffer = makeStateDigest(BOB)
    //   accountHashesArray.push(digest21)
    //   accountHashesArray.push(digest22)
    //
    //   stateTree = new MerkleTree(accountHashesArray)
    //   const stateMerkleRoot2: string = util.addHexPrefix(stateTree.root.toString('hex'))
    //
    //   // const merkleProof2: Buffer[] = stateTree.proof(digest22)
    //
    //   // START User-side ALICE
    //   acceptanceDigestAlice = util.addHexPrefix(makeAcceptanceDigest(ALICE).toString('hex'))
    //   acceptanceDigestFromBlockchainAlice = await plasmoid.acceptCurrentStateDigest(accountsState.get(ALICE)!.channelId, accountsState.get(ALICE)!.amount, accountsState.get(ALICE)!.owner)
    //   expect(acceptanceDigestFromBlockchainAlice).toEqual(acceptanceDigestAlice)
    //   acceptanceSignatureAlice = await sign(ALICE, acceptanceDigestAlice)
    //   // END User-side ALICE
    //
    //   // START User-side BOB
    //   acceptanceDigestBob = util.addHexPrefix(makeAcceptanceDigest(BOB).toString('hex'))
    //   acceptanceDigestFromBlockchainBob = await plasmoid.acceptCurrentStateDigest(accountsState.get(BOB)!.channelId, accountsState.get(BOB)!.amount, accountsState.get(BOB)!.owner)
    //   expect(acceptanceDigestFromBlockchainBob).toEqual(acceptanceDigestBob)
    //   acceptanceSignatureBob = await sign(BOB, acceptanceDigestBob)
    //   // END User-side BOB
    //
    //   acceptanceTree = new MerkleTree([util.sha3(acceptanceSignatureAlice), util.sha3(acceptanceSignatureBob)])
    //   const acceptanceMerkleRoot2 = util.addHexPrefix(acceptanceTree.root.toString('hex'))
    //
    //   ownersTree = new MerkleTree([util.sha3(ALICE), util.sha3(BOB)])
    //   const ownersMerkleRoot2 = util.addHexPrefix(ownersTree.root.toString('hex'))
    //
    //   // START Person that makes a checkpoint side
    //   stateSignatureCheckpointer = await sign(PLASMOID_OWNER, stateMerkleRoot2)
    //   acceptanceSignatureCheckpointer = await sign(PLASMOID_OWNER, acceptanceMerkleRoot2)
    //   ownersSignatureCheckpointer = await sign(PLASMOID_OWNER, ownersMerkleRoot2)
    //   // const recoveredAddress = recover(signature, statMerkleRoot)
    //
    //   // Do the second checkpoint
    //   const tx21 = await plasmoid.checkpoint(stateMerkleRoot2, acceptanceMerkleRoot2, ownersMerkleRoot2, stateSignatureCheckpointer, acceptanceSignatureCheckpointer, ownersSignatureCheckpointer,{ from: PLASMOID_OWNER })
    //   const eventArgs21: PlasmoidWrapper.DidCheckpoint = tx21.logs[0].args
    //   const checkpointUid21 = eventArgs21.checkpointId as BigNumber
    //   // END Person that makes a checkpoint side
    //
    //   // const concat: Buffer = Buffer.concat(merkleProof2)
    //   const concatenatedProofAsString: string = util.addHexPrefix(Buffer.concat(stateTree.proof(digest22)).toString('hex'))
    //
    //
    //
    //   // console.log(`Verify = ${stateTree.verify(stateTree.proof(digest22), digest22)}`)
    //
    //   // Do transfer ownership of channel from ALICE to BOB
    //   const transferDigest = await plasmoid.transferDigest(channelId, BOB)
    //   const transferSignature = await sign(ALICE, transferDigest)
    //   await plasmoid.transfer(channelId, BOB, transferSignature)
    //
    //   // Do withdrawal with checkpoint
    //   const tx3 = await plasmoid.startWithdraw(checkpointUid21, concatenatedProofAsString, channelId, { from: BOB })
    //   PlasmoidWrapper.printEvents(tx3)
    //   console.log(`stateMerkleRoot2 = ${stateMerkleRoot2}`)
    //   //
    //   const eventArgs3: PlasmoidWrapper.DidAddToExitingQueue = tx3.logs[0].args
    //
    //   // expect(PlasmoidWrapper.isDidAddToExitingQueueEvent(tx3.logs[0]))
    //   // expect(PlasmoidWrapper.isDidStartWithdrawEvent(tx3.logs[1]))
    //   const withdrawalRequestID = eventArgs3.withdrawalRequestID
    //   console.log(`withdrawalRequestID : ${withdrawalRequestID}`)
    //   // Some delay for time increasing
    //   setTimeout(async () => {
    //     const tx4 = await plasmoid.finalizeWithdraw(withdrawalRequestID)
    //     expect(tx4.logs[0] && PlasmoidWrapper.isDidFinalizeWithdrawEvent(tx4.logs[0])).toBeTruthy()
    //     done()
    //   }, 2500)
    // })

    // Handle case when owner in not in state merkle root

    // test('withdraw in settling period', async () => {
    //   let accountHashesArray: Buffer[] = []
    //
    //   let tree = new MerkleTree(accountHashesArray)
    //
    //   accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(0), ALICE))
    //   accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(100), BOB))
    //
    //   accountHashesArray = []
    //   const digest21: Buffer = makeStateDigest(ALICE)
    //   const digest22: Buffer = makeStateDigest(BOB)
    //   accountHashesArray.push(digest21)
    //   accountHashesArray.push(digest22)
    //
    //   tree = new MerkleTree(accountHashesArray)
    //   const merkleRoot: string = util.addHexPrefix(tree.root.toString('hex'))
    //
    //   const merkleProof: Buffer[] = tree.proof(digest22)
    //   const signature = await sign(PLASMOID_OWNER, merkleRoot)
    //
    //   const tx1 = await plasmoid.checkpoint(merkleRoot, signature, { from: PLASMOID_OWNER })
    //   const eventArgs: PlasmoidWrapper.DidCheckpoint = tx1.logs[0].args
    //   const checkpointUid = eventArgs.checkpointId as BigNumber
    //
    //   const concat: Buffer = Buffer.concat(merkleProof)
    //   const concatenatedProofAsString: string = util.addHexPrefix(concat.toString('hex'))
    //
    //   const transferDigest = await plasmoid.transferDigest(channelId, BOB)
    //   const transferSignature = await sign(ALICE, transferDigest)
    //   await plasmoid.transfer(channelId, BOB, transferSignature)
    //
    //   const tx2 = await plasmoid.startWithdraw(checkpointUid, concatenatedProofAsString, channelId, { from: BOB })
    //   const eventArgs2: PlasmoidWrapper.DidAddToExitingQueue = tx2.logs[0].args
    //   expect(PlasmoidWrapper.isDidAddToExitingQueueEvent(tx2.logs[0]))
    //   expect(PlasmoidWrapper.isDidStartWithdrawEvent(tx2.logs[1]))
    //   const withdrawalRequestID = eventArgs2.withdrawalRequestID
    //
    //   await expect(plasmoid.finalizeWithdraw(withdrawalRequestID)).rejects.toBeTruthy()
    // })

  //   test('withdrawal with invalid merkle root', async () => {
  //     let accountHashesArray: Buffer[] = []
  //
  //     let tree = new MerkleTree(accountHashesArray)
  //
  //     accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(0), ALICE))
  //     accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(100), BOB))
  //
  //     accountHashesArray = []
  //     const digest21: Buffer = makeStateDigest(ALICE)
  //     const digest22: Buffer = makeStateDigest(BOB)
  //     accountHashesArray.push(digest21)
  //     accountHashesArray.push(digest22)
  //
  //     tree = new MerkleTree(accountHashesArray)
  //     // Reverse string
  //     const merkleRoot: string = util.addHexPrefix(tree.root.toString('hex').split('').reverse().join(''))
  //
  //     const merkleProof: Buffer[] = tree.proof(digest22)
  //     const signature = await sign(PLASMOID_OWNER, merkleRoot)
  //
  //     const tx = await plasmoid.checkpoint(merkleRoot, signature, { from: PLASMOID_OWNER })
  //     const eventArgs: PlasmoidWrapper.DidCheckpoint = tx.logs[0].args
  //     const checkpointUid = eventArgs.checkpointId as BigNumber
  //
  //     const concat: Buffer = Buffer.concat(merkleProof)
  //     const concatenatedProofAsString: string = util.addHexPrefix(concat.toString('hex'))
  //
  //     const transferDigest = await plasmoid.transferDigest(channelId, BOB)
  //     const transferSignature = await sign(ALICE, transferDigest)
  //     const transferTx = await plasmoid.transfer(channelId, BOB, transferSignature)
  //     const eventTransferArgs: PlasmoidWrapper.DidTransfer = transferTx.logs[0].args
  //
  //     await expect(plasmoid.startWithdraw(checkpointUid, concatenatedProofAsString, channelId, { from: BOB })).rejects.toBeTruthy()
  //   })
  // })

  // describe('checkpoint', () => {
  //   let channelId: BigNumber
  //
  //   beforeEach(async () => {
  //     await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
  //     const tx = await plasmoid.deposit(VALUE, { from: ALICE })
  //     const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args
  //     channelId = eventArgs.channelId as BigNumber
  //     accountsState.clear()
  //     accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(100), ALICE))
  //     accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(0), BOB))
  //   })
  //
  //   test('Checkpoint', async () => {
  //     let accountHashesArray: Buffer[] = []
  //
  //     accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(90), ALICE))
  //     accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(10), BOB))
  //
  //     const digest11: Buffer = makeStateDigest(ALICE)
  //     const digest12: Buffer = makeStateDigest(BOB)
  //     accountHashesArray.push(digest11)
  //     accountHashesArray.push(digest12)
  //
  //     let tree = new MerkleTree(accountHashesArray)
  //     const merkleRoot: string = util.addHexPrefix(tree.root.toString('hex'))
  //
  //     const signature = await sign(PLASMOID_OWNER, merkleRoot)
  //
  //     const checkpointIdBefore: BigNumber = await plasmoid.checkpointIdNow()
  //     const tx = await plasmoid.checkpoint(merkleRoot, signature, { from: PLASMOID_OWNER })
  //     const eventArgs: PlasmoidWrapper.DidCheckpoint = tx.logs[0].args
  //     const checkpointIdAfter: BigNumber = await plasmoid.checkpointIdNow()
  //     expect(checkpointIdAfter.toNumber()).toBeGreaterThan(checkpointIdBefore.toNumber())
  //   })
  //
  //   test('Invalid checkpoint\'s signature', async () => {
  //     const merkleRoot: string = '0xcafe'
  //
  //     const signature = await sign(ALICE, merkleRoot)
  //
  //     await expect(plasmoid.checkpoint(merkleRoot, signature, { from: PLASMOID_OWNER })).rejects.toBeTruthy()
  //   })
  // })

  // describe('deposit', () => {
  //   test('move token to contract', async () => {
  //     const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
  //     const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
  //     expect(plasmoidBalanceBefore.toNumber()).toEqual(0)
  //
  //     await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
  //     await plasmoid.deposit(VALUE, { from: ALICE })
  //
  //     const participantAfter = await mintableToken.balanceOf(ALICE)
  //     const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)
  //
  //     expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
  //     expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())
  //   })
  //   test('emit event', async () => {
  //     await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
  //     const tx = await plasmoid.deposit(VALUE, { from: ALICE })
  //     const event = tx.logs[0]
  //     const eventArgs: PlasmoidWrapper.DidDeposit = event.args
  //     expect(PlasmoidWrapper.isDidDepositEvent(event))
  //     expect(eventArgs.owner).toEqual(ALICE)
  //     LOG.info(eventArgs.amount.toString())
  //     expect(eventArgs.amount.toString()).toEqual(VALUE.toString())
  //   })
  //   test('set balance', async () => {
  //     await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
  //     const tx = await plasmoid.deposit(VALUE, { from: ALICE })
  //     const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args
  //     const channelId = eventArgs.channelId as BigNumber
  //
  //     const accountAfter = await plasmoid.balanceOf(channelId)
  //     expect(accountAfter.toString()).toEqual(VALUE.toString())
  //   })
  // })
  //
  // describe('withdraw', () => {
  //   let channelId: BigNumber
  //
  //   beforeEach(async () => {
  //     await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
  //     const tx = await plasmoid.deposit(VALUE, { from: ALICE })
  //     const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args
  //     channelId = eventArgs.channelId as BigNumber
  //   })
  //
  //   test('withdraw token from contract', async () => {
  //     const participantBefore = await mintableToken.balanceOf(ALICE)
  //     const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
  //     expect(participantBefore.toString()).toEqual(MINTED.minus(VALUE).toString())
  //     expect(plasmoidBalanceBefore.toString()).toEqual(VALUE.toString())
  //
  //     await plasmoid.withdraw(channelId, { from: ALICE })
  //
  //     const participantAfter = await mintableToken.balanceOf(ALICE)
  //     const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)
  //
  //     expect(participantAfter.toString()).toEqual(MINTED.toString())
  //     expect(plasmoidBalanceAfter.toString()).toEqual('0')
  //   })
  //   test('emit event', async () => {
  //     const tx = await plasmoid.withdraw(channelId, { from: ALICE })
  //     const event = tx.logs[0]
  //     const eventArgs: PlasmoidWrapper.DidWithdraw = tx.logs[0].args
  //     expect(PlasmoidWrapper.isDidWithdrawEvent(event))
  //     expect(eventArgs.channelId).toEqual(channelId)
  //     expect(eventArgs.owner).toEqual(ALICE)
  //     expect(eventArgs.amount.toString()).toEqual(VALUE.toString())
  //   })
  //   test('set balance', async () => {
  //     const balanceBefore = await plasmoid.balanceOf(channelId)
  //     expect(balanceBefore.toString()).toEqual(VALUE.toString())
  //
  //     await plasmoid.withdraw(channelId, { from: ALICE })
  //
  //     const balanceAfter = await plasmoid.balanceOf(channelId)
  //     expect(balanceAfter.toString()).toEqual('0')
  //   })
  //   test('not if not owner', async () => {
  //     await expect(plasmoid.withdraw(channelId, { from: ALIEN })).rejects.toBeTruthy()
  //   })
  // })
  //
  // describe('transfer', () => {
  //   let channelId: BigNumber
  //
  //   beforeEach(async () => {
  //     await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
  //     const tx = await plasmoid.deposit(VALUE, { from: ALICE })
  //     channelId = tx.logs[0].args.channelId as BigNumber
  //   })
  //
  //   test('change ownership', async () => {
  //     const ownerBefore = await plasmoid.owners(channelId)
  //     expect(ownerBefore).toEqual(ALICE)
  //     await plasmoid.transfer(channelId, BOB, '0x00', { from: ALICE })
  //     const ownerAfter = await plasmoid.owners(channelId)
  //     expect(ownerAfter).toEqual(BOB)
  //   })
  //
  //   test('emit event', async () => {
  //     const tx = await plasmoid.transfer(channelId, BOB, '0x00', { from: ALICE })
  //     const event = tx.logs[0]
  //     const eventArgs: PlasmoidWrapper.DidTransfer = tx.logs[0].args
  //     expect(event.event).toEqual('DidTransfer')
  //     expect(eventArgs.channelId.toString()).toEqual(channelId.toString())
  //     expect(eventArgs.owner).toEqual(ALICE)
  //     expect(eventArgs.receiver).toEqual(BOB)
  //   })
  //   test('not if not owner', async () => {
  //     await expect(plasmoid.transfer(channelId, BOB, '0x00', { from: ALIEN })).rejects.toBeTruthy()
  //   })
  // })
  //
  // describe('transfer, delegate', () => {
  //   let channelId: BigNumber
  //
  //   beforeEach(async () => {
  //     await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
  //     const tx = await plasmoid.deposit(VALUE, { from: ALICE })
  //     const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args
  //     channelId = eventArgs.channelId as BigNumber
  //   })
  //
  //   test('change ownership', async () => {
  //     const ownerBefore = await plasmoid.owners(channelId)
  //     expect(ownerBefore).toEqual(ALICE)
  //     let digest = await plasmoid.transferDigest(channelId, BOB)
  //     let signature = await sign(ALICE, digest)
  //     await plasmoid.transfer(channelId, BOB, signature)
  //     const ownerAfter = await plasmoid.owners(channelId)
  //     expect(ownerAfter).toEqual(BOB)
  //   })
  //   test('emit event', async () => {
  //     let digest = await plasmoid.transferDigest(channelId, BOB)
  //     let signature = await sign(ALICE, digest)
  //     let tx = await plasmoid.transfer(channelId, BOB, signature)
  //     let event = tx.logs[0]
  //     let eventArgs: PlasmoidWrapper.DidTransfer = event.args
  //     expect(PlasmoidWrapper.isDidTransferEvent(event))
  //     expect(eventArgs.owner).toEqual(ALICE)
  //     expect(eventArgs.channelId).toEqual(channelId)
  //     expect(eventArgs.receiver).toEqual(BOB)
  //
  //   })
  //   test('not if not owner', async () => {
  //     let digest = await plasmoid.transferDigest(channelId, BOB)
  //     let signature = await sign(ALIEN, digest)
  //     await expect(plasmoid.transfer(channelId, BOB, signature)).rejects.toBeTruthy()
  //   })
  // })
})
