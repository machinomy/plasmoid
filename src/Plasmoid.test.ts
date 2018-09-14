import * as util from 'ethereumjs-util'
import * as contracts from './index'
import { BigNumber } from 'bignumber.js'
import TestToken from '../build/wrappers/TestToken'
import MerkleTree from './MerkleTree'
import { Buffer } from 'safe-buffer'

const Plasmoid = artifacts.require<contracts.Plasmoid.Contract>('Plasmoid.sol')
const MintableToken = artifacts.require<TestToken.Contract>('TestToken.sol')

const MINTED = 1000
const VALUE = 100

const web3 = (global as any).web3
const elements = [1, 2, 3].map(e => util.sha3(e))

export interface PlasmaPayment {
  channelId: BigNumber,
  amount: BigNumber,
  owner: string
}

function makePaymentDigest (payment: PlasmaPayment): string {
  const paymentArray = [util.toBuffer(payment.channelId), util.toBuffer(payment.amount), util.toBuffer(payment.owner)]
  const concatenatedPaymentArray = Buffer.concat(paymentArray)
  const digestBuffer = util.sha256(concatenatedPaymentArray)
  const digest = digestBuffer.toString()
  return digest
}

function makeMerkleRoot (payments: PlasmaPayment[]): string {
  let acc: Buffer[] = []
  for (let p of payments) {
    acc.concat([util.toBuffer(p.channelId), util.toBuffer(p.amount), util.toBuffer(p.owner)])
  }
  const tree = new MerkleTree(acc)
  const merkleRoot = tree.root
  const merkleRootAsString = merkleRoot.toString()
  return merkleRootAsString
}

function makeMerkleProof (payments: PlasmaPayment[]): Buffer {
  let acc: Buffer[] = []
  for (let p of payments) {
    acc.concat([util.toBuffer(p.channelId), util.toBuffer(p.amount), util.toBuffer(p.owner)])
  }
  const concatenatedPaymentArray = Buffer.concat(acc)
  const tree = new MerkleTree(acc)
  const proofBuffer = Buffer.concat(tree.proof(concatenatedPaymentArray))
  return proofBuffer
}


contract('Plasmoid', accounts => {
  const tokenOwner = accounts[0]

  const ALICE = accounts[1]
  const BOB = accounts[2]
  const ALIEN = accounts[3]

  let mintableToken: TestToken.Contract
  let plasmoid: contracts.Plasmoid.Contract

  beforeEach(async () => {
    mintableToken = await MintableToken.new({from: tokenOwner})
    plasmoid = await Plasmoid.new(mintableToken.address)

    await mintableToken.mint(ALICE, MINTED, {from: tokenOwner})
    await mintableToken.finishMinting({from: tokenOwner})
  })

  describe('deposit', () => {
    test('move token to contract', async () => {
      const participantBefore = await mintableToken.balanceOf(ALICE)
      const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
      expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

      await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
      await plasmoid.deposit(VALUE, { from: ALICE })

      const participantAfter = await mintableToken.balanceOf(ALICE)
      const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

      expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE)
      expect(plasmoidBalanceAfter.toNumber()).toEqual(VALUE)
    })
    test('emit event', async () => {
      await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      const event = tx.logs[0]
      expect(event.event).toEqual('DidDeposit')
      expect(event.args.owner).toEqual(ALICE)
      expect(event.args.amount.toNumber()).toEqual(VALUE)
    })
    test('set balance', async () => {
      await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      const uid = tx.logs[0].args.uid as BigNumber

      const accountAfter = await plasmoid.balanceOf(uid)
      expect(accountAfter.toNumber()).toEqual(VALUE)
    })
  })

  describe('withdraw', () => {
    let uid: BigNumber

    beforeEach(async () => {
      await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      uid = tx.logs[0].args.uid as BigNumber
    })

    test('withdraw token from contract', async () => {
      const participantBefore = await mintableToken.balanceOf(ALICE)
      const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
      expect(participantBefore.toNumber()).toEqual(MINTED - VALUE)
      expect(plasmoidBalanceBefore.toNumber()).toEqual(VALUE)

      await plasmoid.withdraw(uid,{from: ALICE})

      const participantAfter = await mintableToken.balanceOf(ALICE)
      const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

      expect(participantAfter.toNumber()).toEqual(MINTED)
      expect(plasmoidBalanceAfter.toNumber()).toEqual(0)
    })
    test('emit event', async () => {
      const tx = await plasmoid.withdraw(uid,{from: ALICE})
      const event = tx.logs[0]
      expect(event.event).toEqual('DidWithdraw')
      expect(event.args.uid).toEqual(uid)
      expect(event.args.owner).toEqual(ALICE)
      expect(event.args.amount.toNumber()).toEqual(VALUE)
    })
    test('set balance', async () => {
      const balanceBefore = await plasmoid.balanceOf(uid)
      expect(balanceBefore.toNumber()).toEqual(VALUE)

      await plasmoid.withdraw(uid,{from: ALICE})

      const balanceAfter = await plasmoid.balanceOf(uid)
      expect(balanceAfter.toNumber()).toEqual(0)
    })
    test('not if not owner', async () => {
      await expect(plasmoid.withdraw(uid,{from: ALIEN})).rejects.toBeTruthy()
    })
  })

  describe('transfer', () => {
    let uid: BigNumber

    beforeEach(async () => {
      await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      uid = tx.logs[0].args.uid as BigNumber
    })

    test('change ownership', async () => {
      const ownerBefore = await plasmoid.owners(uid)
      expect(ownerBefore).toEqual(ALICE)
      await plasmoid.transfer(uid, BOB, '0x00', { from: ALICE })
      const ownerAfter = await plasmoid.owners(uid)
      expect(ownerAfter).toEqual(BOB)
    })

    test('emit event', async () => {
      const tx = await plasmoid.transfer(uid, BOB, '0x00', { from: ALICE })
      const event = tx.logs[0]
      expect(event.event).toEqual('DidTransfer')
      expect(event.args.uid).toEqual(uid)
      expect(event.args.owner).toEqual(ALICE)
      expect(event.args.receiver).toEqual(BOB)
    })
    test('not if not owner', async () => {
      await expect(plasmoid.transfer(uid, BOB, '0x00', { from: ALIEN })).rejects.toBeTruthy()
    })
  })

  describe('transfer, delegate', () => {
    let uid: BigNumber

    beforeEach(async () => {
      await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      uid = tx.logs[0].args.uid as BigNumber
    })

    test('change ownership', async () => {
      const ownerBefore = await plasmoid.owners(uid)
      expect(ownerBefore).toEqual(ALICE)
      let digest = await plasmoid.transferDigest(uid, BOB)
      let signature = await web3.eth.sign(digest, ALICE)
      await plasmoid.transfer(uid, BOB, signature + '01')
      const ownerAfter = await plasmoid.owners(uid)
      expect(ownerAfter).toEqual(BOB)
    })
    test('emit event', async () => {
      let digest = await plasmoid.transferDigest(uid, BOB)
      let signature = await web3.eth.sign(digest, ALICE)
      let tx = await plasmoid.transfer(uid, BOB, signature + '01')
      let event = tx.logs[0]
      expect(event.event).toEqual('DidTransfer')
      expect(event.args.owner).toEqual(ALICE)
      expect(event.args.uid).toEqual(uid)
      expect(event.args.receiver).toEqual(BOB)
    })
    test('not if not owner', async () => {
      let digest = await plasmoid.transferDigest(uid, BOB)
      let signature = await web3.eth.sign(digest, ALIEN)
      await expect(plasmoid.transfer(uid, BOB, signature + '01')).rejects.toBeTruthy()
    })
  })

  describe('checkpoint', () => {
    let uid: BigNumber, uid2: BigNumber

    beforeEach(async () => {
      await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      const tx2 = await plasmoid.deposit(VALUE + 10, { from: ALICE })
      uid = tx.logs[0].args.uid as BigNumber
      uid2 = tx.logs[0].args.uid as BigNumber
    })

    test('Checkpoint', async () => {
      const digest = '0x1234'
      const signature = await web3.eth.sign(digest, ALICE)
      const checkpointIdBefore: BigNumber = await plasmoid.checkpointId()
      const tx = await plasmoid.checkpoint(digest, signature, { from: ALICE })
      const checkpointIdAfter: BigNumber = tx.logs[0].args.checkpointId
      expect(checkpointIdAfter.toNumber()).toBeGreaterThan(checkpointIdBefore.toNumber())
    })
  })

  describe('withdrawal with checkpoints', () => {
    let uid: BigNumber, uid2: BigNumber

    beforeEach(async () => {
      await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      const tx2 = await plasmoid.deposit(VALUE + 10, { from: ALICE })
      uid = tx.logs[0].args.uid as BigNumber
      uid2 = tx.logs[0].args.uid as BigNumber
    })

    test('Withdrawal', async () => {
      const channelId = new BigNumber(0xcafe)
      const paymentArray: PlasmaPayment[] = []
      const payment1: PlasmaPayment = { channelId: channelId, amount: new BigNumber(10), owner: ALICE }
      paymentArray.push(payment1)

      const digest = makePaymentDigest(payment1)
      const merkleProof = makeMerkleProof(paymentArray)
      const signature = await web3.eth.sign(digest, ALICE)
      const tx = await plasmoid.checkpoint(digest, signature, { from: ALICE })
      const checkpointUid = tx.logs[0].args.uid

      const payment2: PlasmaPayment = { channelId: channelId, amount: new BigNumber(20), owner: ALICE }
      paymentArray.push(payment2)
      const digest2 = makePaymentDigest(payment2)
      const merkleProof2 = makeMerkleProof(paymentArray)
      const signature2 = await web3.eth.sign(digest2, ALICE)
      const tx2 = await plasmoid.checkpoint(digest2, signature2, { from: ALICE })
      const checkpointUid2 = tx.logs[0].args.uid

      const tx3 = await plasmoid.withdrawWithCheckpoint(checkpointUid2, merkleProof2.toString(), channelId, { from: ALICE })
      console.log(JSON.stringify(tx3.logs[0].args))
      expect(tx3.logs[0].event).toEqual('DidWithdrawWithCheckpoint')
    })
  })
})
