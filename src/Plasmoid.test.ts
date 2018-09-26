import * as util from 'ethereumjs-util'
import * as contracts from './index'
import { BigNumber } from 'bignumber.js'
import TestToken from '../build/wrappers/TestToken'
import PlasmoidWrapper from '../build/wrappers/Plasmoid'
import MerkleTree from './MerkleTree'
import { Buffer } from 'safe-buffer'
import Logger from '@machinomy/logger'
import * as Web3  from 'web3'

const numberToBN = require('number-to-bn')
const ethSigUtil = require('eth-sig-util')
require('console.table')

const Plasmoid = artifacts.require<contracts.Plasmoid.Contract>('Plasmoid.sol')
const MintableToken = artifacts.require<TestToken.Contract>('TestToken.sol')

const MINTED = new BigNumber(1000)
const VALUE = new BigNumber(100)

const LOG = new Logger('plasmoid')

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))

let accountsState: Map<string, PlasmaState> = new Map()

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
    const channelIdBuffer = util.setLengthLeft(util.toBuffer(numberToBN(this.channelId)), 32)
    const amountBuffer = util.setLengthLeft((util.toBuffer(numberToBN(this.amount))), 32)
    const ownerBuffer = util.toBuffer(this.owner)
    return Buffer.concat([channelIdBuffer, amountBuffer, ownerBuffer])
  }
}

function makeStateDigest (user: string): Buffer {
  let state: PlasmaState = accountsState.get(user)!
  const digest = util.sha3(state.toBuffer())
  return digest
}

async function sign (address: string, data: string): Promise<string> {
  let result = await web3.eth.sign(address, data)
  result += '01'
  return result
}

function recover (signature: string, data: any): string {
  signature = signature.slice(0, -2)
  const result = ethSigUtil.recoverPersonalSignature({ sig: signature, data: data})
  return result
}


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

  describe('withdrawal with checkpoints', () => {
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

    test('usual case', async (done) => {
      let accountHashesArray: Buffer[] = []

      accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(90), ALICE))
      accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(10), BOB))

      const digest11: Buffer = makeStateDigest(ALICE)
      const digest12: Buffer = makeStateDigest(BOB)
      accountHashesArray.push(digest11)
      accountHashesArray.push(digest12)

      let tree = new MerkleTree(accountHashesArray)
      const merkleRoot: string = util.addHexPrefix(tree.root.toString('hex'))

      const signature = await sign(PLASMOID_OWNER, merkleRoot)
      const recoveredAddress = recover(signature, merkleRoot)

      await plasmoid.setSettlingPeriod(1)

      // Do the first checkpoint
      const tx = await plasmoid.checkpoint(merkleRoot, signature, { from: PLASMOID_OWNER })
      const eventArgs: PlasmoidWrapper.DidCheckpoint = tx.logs[0].args
      const checkpointUid = eventArgs.checkpointId as BigNumber

      accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(0), ALICE))
      accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(100), BOB))

      accountHashesArray = []
      const digest21: Buffer = makeStateDigest(ALICE)
      const digest22: Buffer = makeStateDigest(BOB)
      accountHashesArray.push(digest21)
      accountHashesArray.push(digest22)

      tree = new MerkleTree(accountHashesArray)
      const merkleRoot2: string = util.addHexPrefix(tree.root.toString('hex'))

      const merkleProof2: Buffer[] = tree.proof(digest22)
      const signature2 = await sign(PLASMOID_OWNER, merkleRoot2)

      // Do the second checkpoint
      const tx2 = await plasmoid.checkpoint(merkleRoot2, signature2, { from: PLASMOID_OWNER })
      const eventArgs2: PlasmoidWrapper.DidCheckpoint = tx2.logs[0].args
      const checkpointUid2 = eventArgs2.checkpointId as BigNumber

      const concat: Buffer = Buffer.concat(merkleProof2)
      const concatenatedProofAsString: string = util.addHexPrefix(concat.toString('hex'))

      // Do transfer ownership of channel from ALICE to BOB
      const transferDigest = await plasmoid.transferDigest(channelId, BOB)
      const transferSignature = await sign(ALICE, transferDigest)
      await plasmoid.transfer(channelId, BOB, transferSignature)

      // Do withdrawal with checkpoint
      const tx3 = await plasmoid.startWithdraw(checkpointUid2, concatenatedProofAsString, channelId, { from: BOB })
      const eventArgs3: PlasmoidWrapper.DidAddToExitingQueue = tx3.logs[0].args
      expect(PlasmoidWrapper.isDidAddToExitingQueueEvent(tx3.logs[0]))
      expect(PlasmoidWrapper.isDidStartWithdrawEvent(tx3.logs[1]))
      const withdrawalRequestID = eventArgs3.withdrawalRequestID

      // Some delay for time increasing
      setTimeout(async () => {
        const tx4 = await plasmoid.finalizeWithdraw(withdrawalRequestID)
        expect(tx4.logs[0] && PlasmoidWrapper.isDidFinalizeWithdrawEvent(tx4.logs[0])).toBeTruthy()
        done()
      }, 2500)
    })

    test('withdraw in settling period', async () => {
      let accountHashesArray: Buffer[] = []

      let tree = new MerkleTree(accountHashesArray)

      accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(0), ALICE))
      accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(100), BOB))

      accountHashesArray = []
      const digest21: Buffer = makeStateDigest(ALICE)
      const digest22: Buffer = makeStateDigest(BOB)
      accountHashesArray.push(digest21)
      accountHashesArray.push(digest22)

      tree = new MerkleTree(accountHashesArray)
      const merkleRoot: string = util.addHexPrefix(tree.root.toString('hex'))

      const merkleProof: Buffer[] = tree.proof(digest22)
      const signature = await sign(PLASMOID_OWNER, merkleRoot)

      const tx1 = await plasmoid.checkpoint(merkleRoot, signature, { from: PLASMOID_OWNER })
      const eventArgs: PlasmoidWrapper.DidCheckpoint = tx1.logs[0].args
      const checkpointUid = eventArgs.checkpointId as BigNumber

      const concat: Buffer = Buffer.concat(merkleProof)
      const concatenatedProofAsString: string = util.addHexPrefix(concat.toString('hex'))

      const transferDigest = await plasmoid.transferDigest(channelId, BOB)
      const transferSignature = await sign(ALICE, transferDigest)
      await plasmoid.transfer(channelId, BOB, transferSignature)

      const tx2 = await plasmoid.startWithdraw(checkpointUid, concatenatedProofAsString, channelId, { from: BOB })
      const eventArgs2: PlasmoidWrapper.DidAddToExitingQueue = tx2.logs[0].args
      expect(PlasmoidWrapper.isDidAddToExitingQueueEvent(tx2.logs[0]))
      expect(PlasmoidWrapper.isDidStartWithdrawEvent(tx2.logs[1]))
      const withdrawalRequestID = eventArgs2.withdrawalRequestID

      const tx4 = await plasmoid.finalizeWithdraw(withdrawalRequestID)
      expect(tx4.logs[0]).toBeFalsy()
    })

    test('withdrawal with invalid merkle root', async () => {
      let accountHashesArray: Buffer[] = []

      let tree = new MerkleTree(accountHashesArray)

      accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(0), ALICE))
      accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(100), BOB))

      accountHashesArray = []
      const digest21: Buffer = makeStateDigest(ALICE)
      const digest22: Buffer = makeStateDigest(BOB)
      accountHashesArray.push(digest21)
      accountHashesArray.push(digest22)

      tree = new MerkleTree(accountHashesArray)
      // Reverse string
      const merkleRoot: string = util.addHexPrefix(tree.root.toString('hex').split('').reverse().join(''))

      const merkleProof: Buffer[] = tree.proof(digest22)
      const signature = await sign(PLASMOID_OWNER, merkleRoot)

      const tx = await plasmoid.checkpoint(merkleRoot, signature, { from: PLASMOID_OWNER })
      const eventArgs: PlasmoidWrapper.DidCheckpoint = tx.logs[0].args
      const checkpointUid = eventArgs.checkpointId as BigNumber

      const concat: Buffer = Buffer.concat(merkleProof)
      const concatenatedProofAsString: string = util.addHexPrefix(concat.toString('hex'))

      const transferDigest = await plasmoid.transferDigest(channelId, BOB)
      const transferSignature = await sign(ALICE, transferDigest)
      const transferTx = await plasmoid.transfer(channelId, BOB, transferSignature)
      const eventTransferArgs: PlasmoidWrapper.DidTransfer = transferTx.logs[0].args

      await expect(plasmoid.startWithdraw(checkpointUid, concatenatedProofAsString, channelId, { from: BOB })).rejects.toBeTruthy()
    })
  })

  describe('checkpoint', () => {
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

    test('Checkpoint', async () => {
      let accountHashesArray: Buffer[] = []

      accountsState.set(ALICE, new PlasmaState(channelId, new BigNumber(90), ALICE))
      accountsState.set(BOB, new PlasmaState(channelId, new BigNumber(10), BOB))

      const digest11: Buffer = makeStateDigest(ALICE)
      const digest12: Buffer = makeStateDigest(BOB)
      accountHashesArray.push(digest11)
      accountHashesArray.push(digest12)

      let tree = new MerkleTree(accountHashesArray)
      const merkleRoot: string = util.addHexPrefix(tree.root.toString('hex'))

      const signature = await sign(PLASMOID_OWNER, merkleRoot)

      const checkpointIdBefore: BigNumber = await plasmoid.checkpointIdNow()
      const tx = await plasmoid.checkpoint(merkleRoot, signature, { from: PLASMOID_OWNER })
      const eventArgs: PlasmoidWrapper.DidCheckpoint = tx.logs[0].args
      const checkpointIdAfter: BigNumber = await plasmoid.checkpointIdNow()
      expect(checkpointIdAfter.toNumber()).toBeGreaterThan(checkpointIdBefore.toNumber())
    })

    test('Invalid checkpoint\'s signature', async () => {
      const merkleRoot: string = '0xcafe'

      const signature = await sign(ALICE, merkleRoot)

      await expect(plasmoid.checkpoint(merkleRoot, signature, { from: PLASMOID_OWNER })).rejects.toBeTruthy()
    })
  })

  describe('deposit', () => {
    test('move token to contract', async () => {
      const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
      const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
      expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

      await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      await plasmoid.deposit(VALUE, { from: ALICE })

      const participantAfter = await mintableToken.balanceOf(ALICE)
      const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

      expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
      expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())
    })
    test('emit event', async () => {
      await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      const event = tx.logs[0]
      const eventArgs: PlasmoidWrapper.DidDeposit = event.args
      expect(PlasmoidWrapper.isDidDepositEvent(event))
      expect(eventArgs.owner).toEqual(ALICE)
      LOG.info(eventArgs.amount.toString())
      expect(eventArgs.amount.toString()).toEqual(VALUE.toString())
    })
    test('set balance', async () => {
      await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args
      const channelId = eventArgs.channelId as BigNumber

      const accountAfter = await plasmoid.balanceOf(channelId)
      expect(accountAfter.toString()).toEqual(VALUE.toString())
    })
  })

  describe('withdraw', () => {
    let channelId: BigNumber

    beforeEach(async () => {
      await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args
      channelId = eventArgs.channelId as BigNumber
    })

    test('withdraw token from contract', async () => {
      const participantBefore = await mintableToken.balanceOf(ALICE)
      const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
      expect(participantBefore.toString()).toEqual(MINTED.minus(VALUE).toString())
      expect(plasmoidBalanceBefore.toString()).toEqual(VALUE.toString())

      await plasmoid.withdraw(channelId, { from: ALICE })

      const participantAfter = await mintableToken.balanceOf(ALICE)
      const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

      expect(participantAfter.toString()).toEqual(MINTED.toString())
      expect(plasmoidBalanceAfter.toString()).toEqual('0')
    })
    test('emit event', async () => {
      const tx = await plasmoid.withdraw(channelId, { from: ALICE })
      const event = tx.logs[0]
      const eventArgs: PlasmoidWrapper.DidWithdraw = tx.logs[0].args
      expect(PlasmoidWrapper.isDidWithdrawEvent(event))
      expect(eventArgs.channelId).toEqual(channelId)
      expect(eventArgs.owner).toEqual(ALICE)
      expect(eventArgs.amount.toString()).toEqual(VALUE.toString())
    })
    test('set balance', async () => {
      const balanceBefore = await plasmoid.balanceOf(channelId)
      expect(balanceBefore.toString()).toEqual(VALUE.toString())

      await plasmoid.withdraw(channelId, { from: ALICE })

      const balanceAfter = await plasmoid.balanceOf(channelId)
      expect(balanceAfter.toString()).toEqual('0')
    })
    test('not if not owner', async () => {
      await expect(plasmoid.withdraw(channelId, { from: ALIEN })).rejects.toBeTruthy()
    })
  })

  describe('transfer', () => {
    let channelId: BigNumber

    beforeEach(async () => {
      await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      channelId = tx.logs[0].args.channelId as BigNumber
    })

    test('change ownership', async () => {
      const ownerBefore = await plasmoid.owners(channelId)
      expect(ownerBefore).toEqual(ALICE)
      await plasmoid.transfer(channelId, BOB, '0x00', { from: ALICE })
      const ownerAfter = await plasmoid.owners(channelId)
      expect(ownerAfter).toEqual(BOB)
    })

    test('emit event', async () => {
      const tx = await plasmoid.transfer(channelId, BOB, '0x00', { from: ALICE })
      const event = tx.logs[0]
      const eventArgs: PlasmoidWrapper.DidTransfer = tx.logs[0].args
      expect(event.event).toEqual('DidTransfer')
      expect(eventArgs.channelId.toString()).toEqual(channelId.toString())
      expect(eventArgs.owner).toEqual(ALICE)
      expect(eventArgs.receiver).toEqual(BOB)
    })
    test('not if not owner', async () => {
      await expect(plasmoid.transfer(channelId, BOB, '0x00', { from: ALIEN })).rejects.toBeTruthy()
    })
  })

  describe('transfer, delegate', () => {
    let channelId: BigNumber

    beforeEach(async () => {
      await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args
      channelId = eventArgs.channelId as BigNumber
    })

    test('change ownership', async () => {
      const ownerBefore = await plasmoid.owners(channelId)
      expect(ownerBefore).toEqual(ALICE)
      let digest = await plasmoid.transferDigest(channelId, BOB)
      let signature = await sign(ALICE, digest)
      await plasmoid.transfer(channelId, BOB, signature)
      const ownerAfter = await plasmoid.owners(channelId)
      expect(ownerAfter).toEqual(BOB)
    })
    test('emit event', async () => {
      let digest = await plasmoid.transferDigest(channelId, BOB)
      let signature = await sign(ALICE, digest)
      let tx = await plasmoid.transfer(channelId, BOB, signature)
      let event = tx.logs[0]
      let eventArgs: PlasmoidWrapper.DidTransfer = event.args
      expect(PlasmoidWrapper.isDidTransferEvent(event))
      expect(eventArgs.owner).toEqual(ALICE)
      expect(eventArgs.channelId).toEqual(channelId)
      expect(eventArgs.receiver).toEqual(BOB)

    })
    test('not if not owner', async () => {
      let digest = await plasmoid.transferDigest(channelId, BOB)
      let signature = await sign(ALIEN, digest)
      await expect(plasmoid.transfer(channelId, BOB, signature)).rejects.toBeTruthy()
    })
  })
})
