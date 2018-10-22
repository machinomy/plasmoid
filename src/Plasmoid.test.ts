import * as util from 'ethereumjs-util'
import { AccountService } from './AccountService'
import * as contracts from './index'
import { BigNumber } from 'bignumber.js'
import TestToken from '../build/wrappers/TestToken'
import PlasmoidWrapper from '../build/wrappers/Plasmoid'
import { Buffer } from 'safe-buffer'
import Logger from '@machinomy/logger'
import * as Web3  from 'web3'
import { Participant } from './Participant'
import { PlasmaState } from './PlasmaState'
import * as solUtils from './SolidityUtils'
import { WithdrawalTransaction } from './WithdrawalTransaction'

const ethSigUtil = require('eth-sig-util')


const Plasmoid = artifacts.require<contracts.Plasmoid.Contract>('Plasmoid.sol')
const MintableToken = artifacts.require<TestToken.Contract>('TestToken.sol')
const LibService = artifacts.require('LibService.sol')

const MINTED = new BigNumber(1000)
const VALUE = new BigNumber(100)

const LOG = new Logger('plasmoid')

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))

let accountsState: Map<string, PlasmaState> = new Map()

Plasmoid.link(LibService)

contract('Plasmoid', accounts => {
  const TOKEN_OWNER: string = accounts[0].toLowerCase()
  const PLASMOID_OWNER: string = accounts[4].toLowerCase()

  const ALICE: string = accounts[1].toLowerCase()
  const BOB: string = accounts[2].toLowerCase()
  const ALIEN: string = accounts[3].toLowerCase()

  LOG.info(`ALICE: ${ ALICE }`)
  LOG.info(`BOB: ${ BOB }`)
  LOG.info(`PLASMOID_OWNER: ${ PLASMOID_OWNER }`)
  LOG.info(`TOKEN_OWNER: ${ TOKEN_OWNER }`)

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
    const settlementPeriod: BigNumber = new BigNumber(1)

    mintableToken = await MintableToken.new({ from: TOKEN_OWNER })
    plasmoid = await Plasmoid.new(mintableToken.address,
      settlementPeriod,
      settlementPeriod,
      settlementPeriod,
      settlementPeriod,
      { from: PLASMOID_OWNER })

    await mintableToken.mint(ALICE, MINTED, { from: TOKEN_OWNER })
    await mintableToken.finishMinting({ from: TOKEN_OWNER })

    // const tx = await mintableToken.balanceOf(ALICE)
    // console.log(tx.toString())
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
      expect(eventArgs.lock.toLowerCase()).toEqual(ALICE)
      expect(eventArgs.amount.toString()).toEqual(VALUE.toString())
    })
  })

  describe('TestCheckpoint', () => {

    beforeEach(async () => {
    })

    test('Scenario', async () => {
      // Account service at Alice Machine
      const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
      // Account service at Bob Machine
      const accountServiceAtBob = new AccountService(plasmoid, BOB)
      // Account service at Operator Machine
      const accountServiceAtOperator = new AccountService(plasmoid, PLASMOID_OWNER)

      // Alice user at Alice Machine
      const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, new BigNumber(90))
      // Bob user at Alice Machine
      const bobAsPartyAtAlice: Participant = new Participant(BOB, plasmoid, accountServiceAtBob, new BigNumber(10))
      // Operator user at Alice Machine
      const operatorAsPartyAtAlice: Participant = new Participant(PLASMOID_OWNER, plasmoid, accountServiceAtOperator, new BigNumber(0))

      // Alice user at Bob Machine
      const aliceAsPartyAtBob: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, new BigNumber(90))
      // Bob user at Bob Machine
      const bobAsPartyAtBob: Participant = new Participant(BOB, plasmoid, accountServiceAtBob, new BigNumber(10))
      // Operator user at Bob Machine
      const operatorAsPartyAtBob: Participant = new Participant(PLASMOID_OWNER, plasmoid, accountServiceAtOperator, new BigNumber(0))

      // Alice user at Operator Machine
      const aliceAsPartyAtOperator: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, new BigNumber(90))
      // Bob user at Operator Machine
      const bobAsPartyAtOperator: Participant = new Participant(BOB, plasmoid, accountServiceAtBob, new BigNumber(10))
      // Operator user at Operator Machine
      const operatorAsPartyAtOperator: Participant = new Participant(PLASMOID_OWNER, plasmoid, accountServiceAtOperator, new BigNumber(0))

      accountServiceAtOperator.addParticipant(aliceAsPartyAtOperator)
      accountServiceAtOperator.addParticipant(bobAsPartyAtOperator)
      accountServiceAtOperator.addParticipant(operatorAsPartyAtOperator)

      accountServiceAtAlice.addParticipant(aliceAsPartyAtAlice)
      accountServiceAtAlice.addParticipant(bobAsPartyAtAlice)
      accountServiceAtAlice.addParticipant(operatorAsPartyAtAlice)

      accountServiceAtBob.addParticipant(aliceAsPartyAtBob)
      accountServiceAtBob.addParticipant(bobAsPartyAtBob)
      accountServiceAtBob.addParticipant(operatorAsPartyAtBob)

      // Alice deposit
      await mintableToken.approve(plasmoid.address, new BigNumber(90), { from: aliceAsPartyAtAlice.address })
      const txDeposit = await aliceAsPartyAtAlice.deposit(new BigNumber(90))

      PlasmoidWrapper.printEvents(txDeposit)

      await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))

      await accountServiceAtAlice.addChange(new BigNumber(aliceAsPartyAtAlice.accountService.deposits.length).minus(1), new BigNumber(aliceAsPartyAtAlice.accountService.deposits.length).minus(1))

      await accountServiceAtAlice.addChange(new BigNumber(2), new BigNumber(0x2))

      await accountServiceAtAlice.addChange(new BigNumber(3), new BigNumber(0x1))

      await accountServiceAtAlice.addAccountChange(new BigNumber(aliceAsPartyAtAlice.accountService.deposits.length).minus(1), ALICE)

      await accountServiceAtAlice.addAccountChange(new BigNumber(2), ALICE)

      await accountServiceAtAlice.addAccountChange(new BigNumber(3), ALICE)

      // Operator makes checkpoint
      const txCheckpoint = await operatorAsPartyAtOperator.makeCheckpoint()

      PlasmoidWrapper.printEvents(txCheckpoint)

      const txCheckpointEvents: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint.logs[0].args

      // Alice want to withdraw, add withdrawal transaction to tx array
      const withdrawalTransaction: WithdrawalTransaction = await accountServiceAtAlice.addWithdrawalTransaction(aliceAsPartyAtAlice.address, new BigNumber(90))

      // Get proof for hash of Alice's transaction
      const proof = accountServiceAtAlice.txTree!.proof(withdrawalTransaction.transactionDigest())

      // Get proof for hash of Alice's transaction as string
      const proofAsString = solUtils.bufferArrayTo0xString(proof)

      // Alice signs transaction digest
      const signature = await aliceAsPartyAtAlice.sign(withdrawalTransaction.transactionDigest())

      // Alice starts withdrawal
      const txStartWithdrawal = await aliceAsPartyAtAlice.startWithdrawal(txCheckpointEvents.id as BigNumber, new BigNumber(1), new BigNumber(90), aliceAsPartyAtAlice.address, proofAsString, signature + '01')

      PlasmoidWrapper.printEvents(txStartWithdrawal)

      const txWithdrawalEvents: PlasmoidWrapper.DidStartWithdrawal = txStartWithdrawal.logs[0].args

      // Alice finalise withdrawal
      const txFinaliseWithdrawal = await aliceAsPartyAtAlice.finaliseWithdrawal(txWithdrawalEvents.id as BigNumber)

      PlasmoidWrapper.printEvents(txFinaliseWithdrawal)
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
  })

  describe('Sleepy case', () => {
    beforeEach(async () => {

    })

    describe('DepositWithdrawal', () => {
      test('deposit does not exists', async () => {
        await expect(plasmoid.depositWithdraw(new BigNumber(-1), '0x1234')).rejects.toBeTruthy()
      })

      test('deposit exists', async () => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
        const tx = await plasmoid.deposit(VALUE, { from: ALICE })

        const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args

        aliceAsPartyAtAlice.plasmaState.slotID = eventArgs.id as BigNumber
        aliceAsPartyAtAlice.plasmaState.amount = VALUE
        const hash = aliceAsPartyAtAlice.makeDepositDigest()
        console.log(`hash : ${solUtils.bufferTo0xString(hash)}`)
        const unlock = await aliceAsPartyAtAlice.sign(hash) + '01'
        const tx2 = await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })
        const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args
        // PlasmoidWrapper.printEvents(tx2)

        expect(eventArgs2.id.toString()).toEqual('1')
        expect(eventArgs2.owner.toLowerCase()).toEqual(ALICE.toLowerCase())
        expect(eventArgs2.unlock).toEqual(unlock)
        expect(eventArgs2.depositID.toString()).toEqual(eventArgs.id.toString())
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
        // console.log(`hash : ${solUtils.bufferTo0xString(hash)}`)
        const unlock = await aliceAsPartyAtAlice.sign(hash) + '01'
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
        // console.log(`hash : ${solUtils.bufferTo0xString(hash)}`)
        const unlock = await aliceAsPartyAtAlice.sign(hash) + '01'
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
        // console.log(`hash : ${solUtils.bufferTo0xString(hash)}`)
        const unlock = await aliceAsPartyAtAlice.sign(hash) + '01'
        const tx2 = await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })
        const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args
        // PlasmoidWrapper.printEvents(tx2)

        const checkpointSignature = await sign(PLASMOID_OWNER.toLowerCase(), solUtils.keccak256(solUtils.keccak256FromStrings('transactions'), solUtils.keccak256FromStrings('changes'), solUtils.keccak256FromStrings('accounts')))

        const ttx = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
                                                  solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
                                                  solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
                                                  checkpointSignature + '01', { from: PLASMOID_OWNER })

        const tx3 = await plasmoid.challengeDepositWithdraw(eventArgs2.id, '0x1234', '0x5678', '0x9abc')
        const eventArgs3: PlasmoidWrapper.DidChallengeDepositWithdraw = tx3.logs[0].args
        expect(eventArgs3.id.toString()).toEqual(eventArgs2.id.toString())
      })

      // test('Deposit withdrawal exists in queue', async (done) => {
      //   const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
      //   const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)
      //
      //   await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      //   const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      //
      //   const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args
      //
      //   aliceAsPartyAtAlice.plasmaState.slotID = eventArgs.id as BigNumber
      //   aliceAsPartyAtAlice.plasmaState.amount = VALUE
      //   const hash = aliceAsPartyAtAlice.makeDepositDigest()
      //   const unlock = await aliceAsPartyAtAlice.sign(hash) + '01'
      //   const tx2 = await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })
      //   const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args
      //
      //   setTimeout(async () => {
      //     const tx3 = await plasmoid.finaliseDepositWithdraw(eventArgs2.id)
      //     const eventArgs3: PlasmoidWrapper.DidFinaliseDepositWithdraw = tx3.logs[0].args
      //
      //     expect(eventArgs3.id.toString()).toEqual(eventArgs2.id.toString())
      //     done()
      //   }, 3000)
      //
      // })
      //
      // test('Deposit withdrawal exists in queue AND timeout still proceed', async () => {
      //   const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
      //   const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)
      //
      //   await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
      //   const tx = await plasmoid.deposit(VALUE, { from: ALICE })
      //
      //   const eventArgs: PlasmoidWrapper.DidDeposit = tx.logs[0].args
      //
      //   aliceAsPartyAtAlice.plasmaState.slotID = eventArgs.id as BigNumber
      //   aliceAsPartyAtAlice.plasmaState.amount = VALUE
      //   const hash = aliceAsPartyAtAlice.makeDepositDigest()
      //   const unlock = await aliceAsPartyAtAlice.sign(hash) + '01'
      //   const tx2 = await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })
      //   const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args
      //
      //   await expect(plasmoid.finaliseDepositWithdraw(eventArgs2.id)).rejects.toBeTruthy()
      // })
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
        const unlock = await aliceAsPartyAtAlice.sign(hash) + '01'
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
        const unlock = await aliceAsPartyAtAlice.sign(hash) + '01'
        const tx2 = await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })
        const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args

        setTimeout(async () => {
          const tx3 = await plasmoid.finaliseDepositWithdraw(eventArgs2.id)
          const eventArgs3: PlasmoidWrapper.DidFinaliseDepositWithdraw = tx3.logs[0].args

          expect(eventArgs3.id.toString()).toEqual(eventArgs2.id.toString())
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
        const unlock = await aliceAsPartyAtAlice.sign(hash) + '01'
        const tx2 = await plasmoid.depositWithdraw (eventArgs.id, unlock, { from: ALICE })
        const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = tx2.logs[0].args

        await expect(plasmoid.finaliseDepositWithdraw(eventArgs2.id)).rejects.toBeTruthy()
      })
    })
  })

  // describe('DepositWithdraw', () => {
  //   beforeEach(async () => { })
  //
  //   test('emit event', async () => {
  //     await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
  //     const tx = await plasmoid.deposit(VALUE, { from: ALICE })
  //     const event = tx.logs[0]
  //     const eventArgs: PlasmoidWrapper.DidDeposit = event.args
  //     const depositID: BigNumber = eventArgs.id as BigNumber
  //
  //     const depositWithdrawDigest = await plasmoid.depositDigest(depositID, VALUE)
  //     const depositWithdrawSignature = await sign(ALICE, depositWithdrawDigest)
  //
  //     const checkpointSignature = await sign(PLASMOID_OWNER, solUtils.keccak256(solUtils.stringToBytes('transactions'), solUtils.stringToBytes('changes'), solUtils.stringToBytes('accounts')))
  //
  //     console.log(`RECOVER: ${PLASMOID_OWNER} ${recover(checkpointSignature, solUtils.keccak256(solUtils.stringToBytes('transactions'), solUtils.stringToBytes('changes'), solUtils.stringToBytes('accounts')))}` )
  //
  //     const ttx = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
  //                                               solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
  //                                               solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
  //                                               PLASMOID_OWNER,
  //                                               checkpointSignature + '01')
  //
  //     // PlasmoidWrapper.printEvents(ttx)
  //
  //     // console.log(`HASH = ${solUtils.bytes32To0xString(solUtils.keccak256(solUtils.keccak256FromStrings('transactions'), solUtils.keccak256FromStrings('changes'),solUtils.keccak256FromStrings('accounts')))}`)
  //
  //     const checkpointID = await plasmoid.checkpointIDNow()
  //
  //     const tx2 = await plasmoid.depositWithdraw(depositID, checkpointID, depositWithdrawSignature + '01', { from: ALICE })
  //     const event2 = tx2.logs[0]
  //     const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = event2.args
  //     expect(PlasmoidWrapper.isDidDepositWithdrawEvent(event2))
  //     expect(eventArgs2.id.toString()).toEqual('1')
  //     expect(eventArgs2.depositID).toEqual(eventArgs.id)
  //     expect(eventArgs2.unlock).toEqual(depositWithdrawSignature)
  //     expect(eventArgs2.owner).toEqual(ALICE)
  //   })
  // })
  //
  // describe('ChallengeDepositWithdraw', () => {
  //   beforeEach(async () => { })
  //
  //   test('emit event', async () => {
  //     await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
  //     const tx = await plasmoid.deposit(VALUE, { from: ALICE })
  //     const event = tx.logs[0]
  //     const eventArgs: PlasmoidWrapper.DidDeposit = event.args
  //     const depositID: BigNumber = eventArgs.id as BigNumber
  //
  //     const depositWithdrawDigest = await plasmoid.depositDigest(depositID, VALUE)
  //     const depositWithdrawSignature = await sign(ALICE, depositWithdrawDigest)
  //
  //     const checkpointSignature = await sign(PLASMOID_OWNER, solUtils.keccak256(solUtils.stringToBytes('transactions'), solUtils.stringToBytes('changes'),solUtils.stringToBytes('accounts')))
  //
  //     const ttx = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
  //       solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
  //       solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
  //       PLASMOID_OWNER,
  //       checkpointSignature + '01')
  //     //
  //     // const checkpointID = 0
  //     //
  //     // const tx2 = await plasmoid.depositWithdraw(depositID, checkpointID, depositWithdrawSignature + '01', { from: ALICE })
  //     // const event2 = tx2.logs[0]
  //     // const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = event2.args
  //     // expect(PlasmoidWrapper.isDidDepositWithdrawEvent(event2))
  //     // expect(eventArgs2.id.toString()).toEqual('1')
  //     // expect(eventArgs2.depositID).toEqual(eventArgs.id)
  //     // expect(eventArgs2.unlock).toEqual(depositWithdrawSignature)
  //     // expect(eventArgs2.owner).toEqual(ALICE)
  //     //
  //     // const _proofTransactions = solUtils.bufferArrayTo0xString([solUtils.keccak256(Buffer.from('proof1')), solUtils.keccak256(Buffer.from('proof2'))])
  //     // const _proofChanges = solUtils.bufferArrayTo0xString([solUtils.keccak256(Buffer.from('proof1')), solUtils.keccak256(Buffer.from('proof2'))])
  //     // const _proofAccounts = solUtils.bufferArrayTo0xString([solUtils.keccak256(Buffer.from('proof1')), solUtils.keccak256(Buffer.from('proof2'))])
  //     //
  //     // await expect(plasmoid.challengeDepositWithdraw(eventArgs2.id, checkpointID, _proofTransactions, _proofChanges, _proofAccounts)).rejects.toBeTruthy()
  //   })
  // })
  //
  // describe('FinaliseDepositWithdraw', () => {
  //   beforeEach(async () => { })
  //
  //   test('emit event', async (done) => {
  //     await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
  //
  //     await plasmoid.setDepositWithdrawalPeriod(1)
  //
  //     const tx = await plasmoid.deposit(VALUE, { from: ALICE })
  //     const event = tx.logs[0]
  //     const eventArgs: PlasmoidWrapper.DidDeposit = event.args
  //     const depositID: BigNumber = eventArgs.id as BigNumber
  //
  //     const depositWithdrawDigest = await plasmoid.depositDigest(depositID, VALUE)
  //     const depositWithdrawSignature = await sign(ALICE, depositWithdrawDigest)
  //
  //     const checkpointSignature = await sign(PLASMOID_OWNER, solUtils.keccak256(solUtils.stringToBytes('transactions'), solUtils.stringToBytes('changes'),solUtils.stringToBytes('accounts')))
  //
  //     const ttx = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
  //                                               solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
  //                                               solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
  //                                               PLASMOID_OWNER,
  //                                               checkpointSignature + '01')
  //
  //     const checkpointID = await plasmoid.checkpointIDNow()
  //
  //     const tx2 = await plasmoid.depositWithdraw(depositID, checkpointID, depositWithdrawSignature + '01', { from: ALICE })
  //     const event2 = tx2.logs[0]
  //     const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = event2.args
  //     const depositWithdrawID: BigNumber = eventArgs2.id as BigNumber
  //     expect(PlasmoidWrapper.isDidDepositWithdrawEvent(event2))
  //     expect(eventArgs2.id.toString()).toEqual('1')
  //     expect(eventArgs2.depositID).toEqual(eventArgs.id)
  //     expect(eventArgs2.unlock).toEqual(depositWithdrawSignature)
  //
  //     setTimeout(async () => {
  //       const plasmoidBalanceBefore: BigNumber = (await mintableToken.balanceOf(plasmoid.address)) as BigNumber
  //       const tx3 = await plasmoid.finaliseDepositWithdraw(depositWithdrawID, { from: BOB })
  //       const plasmoidBalanceAfter: BigNumber = (await mintableToken.balanceOf(plasmoid.address)) as BigNumber
  //       expect(plasmoidBalanceAfter.toString()).toEqual((plasmoidBalanceBefore.toNumber() - VALUE.toNumber()).toString())
  //
  //       const event3 = tx3.logs[0]
  //       const eventArgs3: PlasmoidWrapper.DidFinaliseDepositWithdraw = event3.args
  //       expect(eventArgs3.id.toString()).toEqual(depositWithdrawID.toString())
  //       done()
  //     }, 2500)
  //   })
  // })

  // describe('MakeCheckpoint', () => {
  //   beforeEach(async () => { })
  //
  //   test('emit event', async (done) => {
  //     await mintableToken.approve(plasmoid.address, VALUE, { from: ALICE })
  //
  //     await plasmoid.setDepositWithdrawalPeriod(1)
  //
  //     const tx = await plasmoid.deposit(VALUE, { from: ALICE })
  //     const event = tx.logs[0]
  //     const eventArgs: PlasmoidWrapper.DidDeposit = event.args
  //     const depositID: BigNumber = eventArgs.id as BigNumber
  //
  //     const depositWithdrawDigest = await plasmoid.depositDigest(depositID, VALUE)
  //     const depositWithdrawSignature = await sign(ALICE, depositWithdrawDigest)
  //
  //     const checkpointSignature = await sign(PLASMOID_OWNER, solUtils.keccak256FromStrings('transactions', 'changes', 'accounts'))
  //
  //     await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
  //       solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
  //       solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')), PLASMOID_OWNER, checkpointSignature)
  //
  //     const checkpointID = await plasmoid.checkpointIDNow()
  //
  //     const tx2 = await plasmoid.depositWithdraw(depositID, checkpointID, depositWithdrawSignature + '01', { from: ALICE })
  //     const event2 = tx2.logs[0]
  //     const eventArgs2: PlasmoidWrapper.DidDepositWithdraw = event2.args
  //     const depositWithdrawID: BigNumber = eventArgs2.id as BigNumber
  //     expect(PlasmoidWrapper.isDidDepositWithdrawEvent(event2))
  //     expect(eventArgs2.id.toString()).toEqual('1')
  //     expect(eventArgs2.depositID).toEqual(eventArgs.id)
  //     expect(eventArgs2.unlock).toEqual(depositWithdrawSignature)
  //
  //     setTimeout(async () => {
  //       const plasmoidBalanceBefore: BigNumber = (await mintableToken.balanceOf(plasmoid.address)) as BigNumber
  //       const tx3 = await plasmoid.finaliseDepositWithdraw(depositWithdrawID, { from: BOB })
  //       const plasmoidBalanceAfter: BigNumber = (await mintableToken.balanceOf(plasmoid.address)) as BigNumber
  //       expect(plasmoidBalanceAfter.toString()).toEqual((plasmoidBalanceBefore.toNumber() - VALUE.toNumber()).toString())
  //
  //       const event3 = tx3.logs[0]
  //       const eventArgs3: PlasmoidWrapper.DidFinaliseDepositWithdraw = event3.args
  //       expect(eventArgs3.id.toString()).toEqual(depositWithdrawID.toString())
  //       done()
  //     }, 2500)
  //   })
  // })
  //
  // describe('QuerySlot', () => {
  //   beforeEach(async () => { })
  //
  //   test('emit event', async () => {
  //     const tx = await plasmoid.querySlot(new BigNumber(1), new BigNumber(2))
  //     const event = tx.logs[0]
  //     const eventArgs: PlasmoidWrapper.DidQuerySlot = event.args
  //
  //     expect(PlasmoidWrapper.isDidQuerySlotEvent(event))
  //     expect(eventArgs.checkpointID.toString()).toEqual('1')
  //     expect(eventArgs.slotID.toString()).toEqual('2')
  //   })
  // })
})
