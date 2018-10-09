import * as util from 'ethereumjs-util'
import * as contracts from './index'
import { BigNumber } from 'bignumber.js'
import TestToken from '../build/wrappers/TestToken'
import PlasmoidWrapper from '../build/wrappers/Plasmoid'
import { Buffer } from 'safe-buffer'
import Logger from '@machinomy/logger'
import * as Web3  from 'web3'
import { PlasmaState } from './PlasmaState'
import * as solUtils from './SolidityUtils'

const ethSigUtil = require('eth-sig-util')


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

  async function sign (address: string, data: string | Buffer): Promise<string> {
    if (data instanceof Buffer) {
    data = data.toString('hex')
  }
  let result = await web3.eth.sign(address, data)
  // result += '01'
  return result
}

  function recover (signature: string, data: any): string {
    // signature = signature.slice(0, -2)
    const result = ethSigUtil.recoverPersonalSignature({ sig: signature, data: data})
    return result
  }

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
      expect(eventArgs.lock).toEqual(ALICE)
      expect(eventArgs.amount.toString()).toEqual(VALUE.toString())
    })
  })

  describe('DepositWithdraw', () => {
    beforeEach(async () => { })

    test('emit event', async () => {
      await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      const event = tx.logs[0]
      const eventArgs: PlasmoidWrapper.DidDeposit = event.args
      const depositID: BigNumber = eventArgs.id as BigNumber

      const depositWithdrawDigest = await plasmoid.depositDigest(depositID, VALUE)
      const depositWithdrawSignature = await sign(ALICE, depositWithdrawDigest)

      await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256(Buffer.from('transactions'))),
        solUtils.bufferTo0xString(solUtils.keccak256(Buffer.from('changes'))),
        solUtils.bufferTo0xString(solUtils.keccak256(Buffer.from('accounts'))))

      const checkpointID = await plasmoid.checkpointIDNow()

      const tx2 = await plasmoid.depositWithdraw(depositID, checkpointID, depositWithdrawSignature + '01', { from: ALICE })
      const event2 = tx2.logs[0]
      const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = event2.args
      expect(PlasmoidWrapper.isDidDepositWithdrawEvent(event2))
      expect(eventArgs2.id.toString()).toEqual('1')
      expect(eventArgs2.depositID).toEqual(eventArgs.id)
      expect(eventArgs2.unlock).toEqual(depositWithdrawSignature)
      expect(eventArgs2.owner).toEqual(ALICE)
    })
  })

  describe('ChallengeDepositWithdraw', () => {
    beforeEach(async () => { })

    test('emit event', async () => {
      await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      const event = tx.logs[0]
      const eventArgs: PlasmoidWrapper.DidDeposit = event.args
      const depositID: BigNumber = eventArgs.id as BigNumber

      const depositWithdrawDigest = await plasmoid.depositDigest(depositID, VALUE)
      const depositWithdrawSignature = await sign(ALICE, depositWithdrawDigest)

      await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256(Buffer.from('transactions'))),
        solUtils.bufferTo0xString(solUtils.keccak256(Buffer.from('changes'))),
        solUtils.bufferTo0xString(solUtils.keccak256(Buffer.from('accounts'))))

      const checkpointID = 0

      const tx2 = await plasmoid.depositWithdraw(depositID, checkpointID, depositWithdrawSignature + '01', { from: ALICE })
      const event2 = tx2.logs[0]
      const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = event2.args
      expect(PlasmoidWrapper.isDidDepositWithdrawEvent(event2))
      expect(eventArgs2.id.toString()).toEqual('1')
      expect(eventArgs2.depositID).toEqual(eventArgs.id)
      expect(eventArgs2.unlock).toEqual(depositWithdrawSignature)
      expect(eventArgs2.owner).toEqual(ALICE)

      const _proofTransactions = solUtils.bufferArrayTo0xString([solUtils.keccak256(Buffer.from('proof1')), solUtils.keccak256(Buffer.from('proof2'))])
      const _proofChanges = solUtils.bufferArrayTo0xString([solUtils.keccak256(Buffer.from('proof1')), solUtils.keccak256(Buffer.from('proof2'))])
      const _proofAccounts = solUtils.bufferArrayTo0xString([solUtils.keccak256(Buffer.from('proof1')), solUtils.keccak256(Buffer.from('proof2'))])

      await expect(plasmoid.challengeDepositWithdraw(eventArgs2.id, checkpointID, _proofTransactions, _proofChanges, _proofAccounts)).rejects.toBeTruthy()
    })
  })

  describe('FinaliseDepositWithdraw', () => {
    beforeEach(async () => { })

    test('emit event', async (done) => {
      await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })

      await plasmoid.setDepositWithdrawalPeriod(1)

      const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      const event = tx.logs[0]
      const eventArgs: PlasmoidWrapper.DidDeposit = event.args
      const depositID: BigNumber = eventArgs.id as BigNumber

      const depositWithdrawDigest = await plasmoid.depositDigest(depositID, VALUE)
      const depositWithdrawSignature = await sign(ALICE, depositWithdrawDigest)

      await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256(Buffer.from('transactions'))),
                                    solUtils.bufferTo0xString(solUtils.keccak256(Buffer.from('changes'))),
                                    solUtils.bufferTo0xString(solUtils.keccak256(Buffer.from('accounts'))))

      const checkpointID = await plasmoid.checkpointIDNow()

      const tx2 = await plasmoid.depositWithdraw(depositID, checkpointID, depositWithdrawSignature + '01', { from: ALICE })
      const event2 = tx2.logs[0]
      const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = event2.args
      const depositWithdrawID: BigNumber = eventArgs2.id as BigNumber
      expect(PlasmoidWrapper.isDidDepositWithdrawEvent(event2))
      expect(eventArgs2.id.toString()).toEqual('1')
      expect(eventArgs2.depositID).toEqual(eventArgs.id)
      expect(eventArgs2.unlock).toEqual(depositWithdrawSignature)

      setTimeout(async () => {
        const plasmoidBalanceBefore: BigNumber = (await mintableToken.balanceOf(plasmoid.address)) as BigNumber
        const tx3 = await plasmoid.finaliseDepositWithdraw(depositWithdrawID, { from: BOB })
        const plasmoidBalanceAfter: BigNumber = (await mintableToken.balanceOf(plasmoid.address)) as BigNumber
        expect(plasmoidBalanceAfter.toString()).toEqual((plasmoidBalanceBefore.toNumber() - VALUE.toNumber()).toString())

        const event3 = tx3.logs[0]
        const eventArgs3: PlasmoidWrapper.DidFinaliseDepositWithdraw = event3.args
        expect(eventArgs3.id.toString()).toEqual(depositWithdrawID.toString())
        done()
      }, 2500)
    })
  })

  describe('QuerySlot', () => {
    beforeEach(async () => { })

    test('emit event', async () => {
      const tx = await plasmoid.querySlot(new BigNumber(1), new BigNumber(2))
      const event = tx.logs[0]
      const eventArgs: PlasmoidWrapper.DidQuerySlot = event.args

      expect(PlasmoidWrapper.isDidQuerySlotEvent(event))
      expect(eventArgs.checkpointID.toString()).toEqual('1')
      expect(eventArgs.slotID.toString()).toEqual('2')
    })
  })
})
