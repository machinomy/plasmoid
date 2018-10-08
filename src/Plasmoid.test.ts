import * as util from 'ethereumjs-util'
import * as contracts from './index'
import { BigNumber } from 'bignumber.js'
import TestToken from '../build/wrappers/TestToken'
import PlasmoidWrapper from '../build/wrappers/Plasmoid'
import { Buffer } from 'safe-buffer'
import Logger from '@machinomy/logger'
import * as Web3  from 'web3'
import { PlasmaState } from './PlasmaState'


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

  LOG.info(`ALICE: ${ ALICE }`)
  LOG.info(`BOB: ${ BOB }`)

  let mintableToken: TestToken.Contract
  let plasmoid: contracts.Plasmoid.Contract

  beforeEach(async () => {
    mintableToken = await MintableToken.new({ from: TOKEN_OWNER })
    plasmoid = await Plasmoid.new(mintableToken.address, { from: PLASMOID_OWNER })

    await mintableToken.mint(ALICE, MINTED, { from: TOKEN_OWNER })
    await mintableToken.finishMinting({ from: TOKEN_OWNER })
  })

  describe('Deposit', () => {
    beforeEach(async () => { })

      test('move token to contract', async () => {
        const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
        expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

        await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
        await plasmoid.deposit(VALUE, PLASMOID_OWNER, { from: ALICE })

        const participantAfter = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

        expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
        expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())
      })

    test('emit event', async () => {
      await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      const tx = await plasmoid.deposit(VALUE, PLASMOID_OWNER, { from: ALICE })
      const event = tx.logs[0]
      const eventArgs: PlasmoidWrapper.DidDeposit = event.args
      expect(PlasmoidWrapper.isDidDepositEvent(event))
      expect(eventArgs.lock).toEqual(PLASMOID_OWNER)
      expect(eventArgs.amount.toString()).toEqual(VALUE.toString())
    })
  })

  describe('DepositWithdraw', () => {
    beforeEach(async () => { })

    test('emit event', async () => {
      await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      const tx = await plasmoid.deposit(VALUE, PLASMOID_OWNER, { from: ALICE })
      const event = tx.logs[0]
      const eventArgs: PlasmoidWrapper.DidDeposit = event.args
      const depositID: BigNumber =  eventArgs.id as BigNumber
      const tx2 = await plasmoid.depositWithdraw(depositID, PLASMOID_OWNER, { from: BOB })
      const event2 = tx2.logs[0]
      const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = event2.args
      expect(PlasmoidWrapper.isDidDepositWithdrawEvent(event2))
      expect(eventArgs2.id.toString()).toEqual('1')
      expect(eventArgs2.depositID).toEqual(eventArgs.id)
      expect(eventArgs2.unlock).toEqual(PLASMOID_OWNER)
    })
  })
})
