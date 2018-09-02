import * as contracts from './index'
import { BigNumber } from 'bignumber.js'
import TestToken from '../build/wrappers/TestToken'

const Plasmoid = artifacts.require<contracts.Plasmoid.Contract>('Plasmoid.sol')
const MintableToken = artifacts.require<TestToken.Contract>('TestToken.sol')

const MINTED = 1000
const VALUE = 100

contract('Plasmoid', accounts => {
  const tokenOwner = accounts[0]

  const ALICE = accounts[1]
  const BOB = accounts[2]

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
    xtest('not if not owner', async () => {
      // Do Nothing Yet
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
      await plasmoid.transfer(uid, BOB, { from: ALICE })
      const ownerAfter = await plasmoid.owners(uid)
      expect(ownerAfter).toEqual(BOB)
    })

    test('emit event', async () => {
      const tx = await plasmoid.transfer(uid, BOB, { from: ALICE })
      const event = tx.logs[0]
      expect(event.event).toEqual('DidTransfer')
      expect(event.args.uid).toEqual(uid)
      expect(event.args.owner).toEqual(ALICE)
      expect(event.args.receiver).toEqual(BOB)
    })
    xtest('not if not owner', async () => {
      // Do Nothing Yet
    })
  })

  describe('transferDelegate', () => {
    xtest('change ownership', async () => {
      // Do Nothing Yet
    })
    xtest('emit event', async () => {
      // Do Nothing Yet
    })
    xtest('not if not owner', async () => {
      // Do Nothing Yet
    })
  })
})
