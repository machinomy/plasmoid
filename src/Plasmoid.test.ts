import * as contracts from './index'
import { BigNumber } from 'bignumber.js'

const Plasmoid = artifacts.require<contracts.Plasmoid.Contract>('Plasmoid.sol')
const MintableToken = artifacts.require<contracts.MintableToken.Contract>('MintableToken.sol')

const MINTED = 1000
const VALUE = 100

contract('Plasmoid', accounts => {
  const tokenOwner = accounts[0]
  const participant = accounts[4]

  let mintableToken: contracts.MintableToken.Contract
  let plasmoid: contracts.Plasmoid.Contract

  beforeEach(async () => {
    mintableToken = await MintableToken.new({from: tokenOwner})
    plasmoid = await Plasmoid.new(mintableToken.address)

    await mintableToken.mint(participant, MINTED, {from: tokenOwner})
    await mintableToken.finishMinting({from: tokenOwner})
  })

  describe('deposit', () => {
    test('move token to contract', async () => {
      const participantBefore = await mintableToken.balanceOf(participant)
      const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
      expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

      await mintableToken.approve(plasmoid.address, VALUE, {from: participant})
      await plasmoid.deposit(VALUE, { from: participant })

      const participantAfter = await mintableToken.balanceOf(participant)
      const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

      expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE)
      expect(plasmoidBalanceAfter.toNumber()).toEqual(VALUE)
    })
    test('emit event', async () => {
      await mintableToken.approve(plasmoid.address, VALUE, {from: participant})
      const tx = await plasmoid.deposit(VALUE, { from: participant })
      const event = tx.logs[0]
      expect(event.event).toEqual('DidDeposit')
      expect(event.args.owner).toEqual(participant)
      expect(event.args.amount.toNumber()).toEqual(VALUE)
    })
    test('set balance', async () => {
      await mintableToken.approve(plasmoid.address, VALUE, {from: participant})
      const tx = await plasmoid.deposit(VALUE, { from: participant })
      const uid = tx.logs[0].args.uid as BigNumber

      const accountAfter = await plasmoid.balanceOf(uid)
      expect(accountAfter.toNumber()).toEqual(VALUE)
    })
  })

  describe('withdraw', () => {
    let uid: BigNumber

    beforeEach(async () => {
      await mintableToken.approve(plasmoid.address, VALUE, {from: participant})
      const tx = await plasmoid.deposit(VALUE, { from: participant })
      uid = tx.logs[0].args.uid as BigNumber
    })

    test('withdraw token from contract', async () => {
      const participantBefore = await mintableToken.balanceOf(participant)
      const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
      expect(participantBefore.toNumber()).toEqual(MINTED - VALUE)
      expect(plasmoidBalanceBefore.toNumber()).toEqual(VALUE)

      await plasmoid.withdraw(uid,{from: participant})

      const participantAfter = await mintableToken.balanceOf(participant)
      const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

      expect(participantAfter.toNumber()).toEqual(MINTED)
      expect(plasmoidBalanceAfter.toNumber()).toEqual(0)
    })
    test('emit event', async () => {
      let tx = await plasmoid.withdraw(uid,{from: participant})
      let event = tx.logs[0]
      expect(event.event).toEqual('DidWithdraw')
      expect(event.args.uid).toEqual(uid)
      expect(event.args.owner).toEqual(participant)
      expect(event.args.amount.toNumber()).toEqual(VALUE)
    })
    test('set balance', async () => {
      const balanceBefore = await plasmoid.balanceOf(uid)
      expect(balanceBefore.toNumber()).toEqual(VALUE)

      await plasmoid.withdraw(uid,{from: participant})

      const balanceAfter = await plasmoid.balanceOf(uid)
      expect(balanceAfter.toNumber()).toEqual(0)
    })
  })
})
