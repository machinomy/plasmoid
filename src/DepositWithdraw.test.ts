import Logger from '@machinomy/logger'
import { BigNumber } from 'bignumber.js'
import PlasmoidWrapper from '../build/wrappers/Plasmoid'
import TestToken from '../build/wrappers/TestToken'
import { AccountService } from './AccountService'
import * as contracts from './index'
import { Participant } from './Participant'
import * as solUtils from './SolidityUtils'
import { WithdrawalTransaction } from './WithdrawalTransaction'
import * as Web3  from 'web3'
import { Buffer } from 'safe-buffer'

const Plasmoid = artifacts.require<contracts.Plasmoid.Contract>('Plasmoid.sol')
const MintableToken = artifacts.require<TestToken.Contract>('TestToken.sol')
const LibBytes = artifacts.require('LibBytes.sol')
const LibService = artifacts.require('LibService.sol')
const LibStructs = artifacts.require('LibStructs.sol')
const LibCheckpointed = artifacts.require('CheckpointedLib.sol')
const LibDepositable = artifacts.require('DepositableLib.sol')

const MINTED = new BigNumber(1000)
const VALUE = new BigNumber(100)

const LOG = new Logger('plasmoid')

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))

Plasmoid.link(LibBytes)
Plasmoid.link(LibService)
Plasmoid.link(LibStructs)
Plasmoid.link(LibCheckpointed)
Plasmoid.link(LibDepositable)

contract('Plasmoid', accounts => {
  const TOKEN_OWNER: string = accounts[0].toLowerCase()
  const CONTRACT_OWNER: string = accounts[4].toLowerCase()

  const ALICE: string = accounts[1].toLowerCase()
  const BOB: string = accounts[2].toLowerCase()
  const ALIEN: string = accounts[3].toLowerCase()

  LOG.info(`ALICE: ${ ALICE }`)
  LOG.info(`BOB: ${ BOB }`)
  LOG.info(`CONTRACT_OWNER: ${ CONTRACT_OWNER }`)
  LOG.info(`TOKEN_OWNER: ${ TOKEN_OWNER }`)

  let mintableToken: TestToken.Contract
  let plasmoid: contracts.Plasmoid.Contract

  async function sign (address: string, data: string | Buffer): Promise<string> {
    if (data instanceof Buffer) {
      data = data.toString('hex')
    }
    let result = await web3.eth.sign(address, data)
    result += '01'
    return result
  }


  beforeEach(async () => {
    const settlementPeriod: BigNumber = new BigNumber(1)

    mintableToken = await MintableToken.new({from: TOKEN_OWNER})
    plasmoid = await Plasmoid.new(mintableToken.address,
      settlementPeriod,
      settlementPeriod,
      settlementPeriod,
      settlementPeriod,
      settlementPeriod,
      {from: CONTRACT_OWNER})

    await mintableToken.mint(ALICE, MINTED, {from: TOKEN_OWNER})
    await mintableToken.finishMinting({from: TOKEN_OWNER})

    // const tx = await mintableToken.balanceOf(ALICE)
    // console.log(tx.toString())
  })

  describe('Sleepy case', () => {
    describe('DepositWithdrawal', () => {
      test('deposit does not exists', async () => {
        await expect(plasmoid.depositWithdraw(new BigNumber(-1), '0x1234')).rejects.toBeTruthy()
      })

      test('deposit exists', async () => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
        const tx = await plasmoid.deposit(VALUE, { from: ALICE })
        const depositId = tx.logs[0].args.id as BigNumber

        aliceAsPartyAtAlice.plasmaState.slotID = depositId
        aliceAsPartyAtAlice.plasmaState.amount = VALUE
        const hash = aliceAsPartyAtAlice.makeDepositDigest()
        const unlock = await aliceAsPartyAtAlice.sign(hash)

        const tx2 = await plasmoid.depositWithdraw(depositId, unlock, { from: ALICE })
        const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args
        // PlasmoidWrapper.printEvents(tx2)

        expect(eventArgs2.id.toString()).toEqual('1')
        expect(eventArgs2.owner.toLowerCase()).toEqual(ALICE.toLowerCase())
        expect(eventArgs2.unlock).toEqual(unlock)
        expect(eventArgs2.depositID.toString()).toEqual(depositId.toString())
        expect(eventArgs2.checkpointID.toString()).toEqual('0')
      })
    })

    describe('ChallengeDepositWithdrawal', () => {
      beforeEach(async () => {

      })

      test('Deposit withdrawal does not exists in queue', async () => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
        const tx = await plasmoid.deposit(VALUE, { from: ALICE })

        const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args

        aliceAsPartyAtAlice.plasmaState.slotID = eventArgs.id as BigNumber
        aliceAsPartyAtAlice.plasmaState.amount = VALUE
        const hash = aliceAsPartyAtAlice.makeDepositDigest()
        const unlock = await aliceAsPartyAtAlice.sign(hash)
        const tx2 = await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })
        const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args
        // PlasmoidWrapper.printEvents(tx2)

        await expect(plasmoid.challengeDepositWithdraw(new BigNumber(-1), '0x1234', '0x5678', '0x9abc')).rejects.toBeTruthy()
      })

      test('Deposit withdrawal does exists in queue AND timeout is already elapsed ', async (done) => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
        const tx = await plasmoid.deposit(VALUE, { from: ALICE })

        const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args

        aliceAsPartyAtAlice.plasmaState.slotID = eventArgs.id as BigNumber
        aliceAsPartyAtAlice.plasmaState.amount = VALUE
        const hash = aliceAsPartyAtAlice.makeDepositDigest()
        const unlock = await aliceAsPartyAtAlice.sign(hash)
        const tx2 = await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })
        const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args
        // PlasmoidWrapper.printEvents(tx2)
        setTimeout(async () => {
          await expect(plasmoid.challengeDepositWithdraw(eventArgs2.id, '0x1234', '0x5678', '0x9abc')).rejects.toBeTruthy()
          done()
        }, 2000)
      })

      test('Deposit withdrawal does exists in queue AND timeout still proceed ', async () => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
        const tx = await plasmoid.deposit(VALUE, { from: ALICE })

        const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args

        aliceAsPartyAtAlice.plasmaState.slotID = eventArgs.id as BigNumber
        aliceAsPartyAtAlice.plasmaState.amount = VALUE
        const hash = aliceAsPartyAtAlice.makeDepositDigest()
        const unlock = await aliceAsPartyAtAlice.sign(hash)

        const tx2 = await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })
        const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args
        // PlasmoidWrapper.printEvents(tx2)

        const checkpointSignature = await sign(CONTRACT_OWNER.toLowerCase(), solUtils.keccak256(solUtils.keccak256FromStrings('transactions'), solUtils.keccak256FromStrings('changes'), solUtils.keccak256FromStrings('accounts')))

        const ttx = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
          checkpointSignature, { from: CONTRACT_OWNER })

        const tx3 = await plasmoid.challengeDepositWithdraw(eventArgs2.id, '0x1234', '0x5678', '0x9abc')
        const eventArgs3: PlasmoidWrapper.DidChallengeDepositWithdraw = tx3.logs[0].args
        expect(eventArgs3.id.toString()).toEqual(eventArgs2.id.toString())
      })
    })

    describe('FinaliseDepositWithdrawal', () => {
      beforeEach(async () => {

      })

      test('Deposit withdrawal does not exists in queue', async (done) => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
        const tx = await plasmoid.deposit(VALUE, { from: ALICE })

        const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args

        aliceAsPartyAtAlice.plasmaState.slotID = eventArgs.id as BigNumber
        aliceAsPartyAtAlice.plasmaState.amount = VALUE
        const hash = aliceAsPartyAtAlice.makeDepositDigest()
        const unlock = await aliceAsPartyAtAlice.sign(hash)
        await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })

        setTimeout(async () => {
          await expect(plasmoid.finaliseDepositWithdraw(new BigNumber(-1))).rejects.toBeTruthy()
          done()
        }, 3000)
      })

      test('Deposit withdrawal exists in queue', async (done) => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
        const tx = await plasmoid.deposit(VALUE, { from: ALICE })

        const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args

        aliceAsPartyAtAlice.plasmaState.slotID = eventArgs.id as BigNumber
        aliceAsPartyAtAlice.plasmaState.amount = VALUE
        const hash = aliceAsPartyAtAlice.makeDepositDigest()
        const unlock = await aliceAsPartyAtAlice.sign(hash)
        const tx2 = await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })
        const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args

        setTimeout(async () => {
          const tx3 = await plasmoid.finaliseDepositWithdraw(eventArgs2.id)
          const eventArgs3: PlasmoidWrapper.DidFinaliseDepositWithdraw = tx3.logs[0].args

          const element = await plasmoid.depositWithdrawalQueue(eventArgs2.id)
          expect(eventArgs3.id.toString()).toEqual(eventArgs2.id.toString())
          expect(element[0].toString()).toEqual('0')
          done()
        }, 3000)

      })

      test('Deposit withdrawal exists in queue AND timeout still proceed', async () => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
        const tx = await plasmoid.deposit(VALUE, { from: ALICE })

        const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args

        aliceAsPartyAtAlice.plasmaState.slotID = eventArgs.id as BigNumber
        aliceAsPartyAtAlice.plasmaState.amount = VALUE
        const hash = aliceAsPartyAtAlice.makeDepositDigest()
        const unlock = await aliceAsPartyAtAlice.sign(hash)
        const tx2 = await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })
        const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args

        await expect(plasmoid.finaliseDepositWithdraw(eventArgs2.id)).rejects.toBeTruthy()
      })
    })

    describe('DepositWithdrawProve', () => {
      test('Deposit exists in queue', async () => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
        const tx = await plasmoid.deposit(VALUE, { from: ALICE })

        const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args

        aliceAsPartyAtAlice.plasmaState.slotID = eventArgs.id as BigNumber
        aliceAsPartyAtAlice.plasmaState.amount = VALUE
        const hash = aliceAsPartyAtAlice.makeDepositDigest()
        const unlock = await aliceAsPartyAtAlice.sign(hash)
        const tx2 = await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })
        const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args

        const result = await plasmoid.depositWithdrawProve(eventArgs2.depositID, VALUE, ALICE, unlock, solUtils.bufferTo0xString(hash), solUtils.bufferTo0xString(hash), solUtils.bufferTo0xString(hash), unlock, unlock, unlock)

        expect(result).toBeTruthy()
      })

      test('Deposit does not exists in queue', async () => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
        const tx = await plasmoid.deposit(VALUE, { from: ALICE })

        const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args

        aliceAsPartyAtAlice.plasmaState.slotID = eventArgs.id as BigNumber
        aliceAsPartyAtAlice.plasmaState.amount = VALUE
        const hash = aliceAsPartyAtAlice.makeDepositDigest()
        const unlock = await aliceAsPartyAtAlice.sign(hash)

        await expect(plasmoid.depositWithdrawProve(new BigNumber(-1),  VALUE, ALICE, unlock, solUtils.bufferTo0xString(hash), solUtils.bufferTo0xString(hash), solUtils.bufferTo0xString(hash), unlock, unlock, unlock)).rejects.toBeTruthy()
      })
    })
  })

})
