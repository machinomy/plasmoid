import Logger from '@machinomy/logger'
import { BigNumber } from 'bignumber.js'
import PlasmoidWrapper from '../build/wrappers/Plasmoid'
import TestToken from '../build/wrappers/TestToken'
import { AccountService } from './AccountService'
import * as contracts from './index'
import { Participant } from './Participant'
import * as solUtils from './SolidityUtils'
import { WithdrawalTransaction } from './WithdrawalTransaction'
import { DepositTransaction} from './DepositTransaction'
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

  describe('Dummy case', () => {
    describe('Deposit', () => {
      test('Move token to contract', async () => {
        const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
        expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

        await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
        await plasmoid.deposit(VALUE, {from: ALICE})

        const participantAfter = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

        expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
        expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())
      })

      test('Can not transfer token to contract without approval', async () => {
        const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
        expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

        await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
        await plasmoid.deposit(VALUE, {from: ALICE})

        const participantAfter = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

        expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
        expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())
      })

      test('Deposit successfully added', async () => {
        await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
        const prevDepositId = await plasmoid.currentDepositId()
        const tx = await plasmoid.deposit(VALUE, {from: ALICE})
        expect(PlasmoidWrapper.isDidDepositEvent(tx.logs[0]))

        const eventArgs = tx.logs[0].args

        const deposit = await plasmoid.deposits(eventArgs.id)

        expect(eventArgs.lock.toLowerCase()).toEqual(ALICE)
        expect(eventArgs.amount.toString()).toEqual(VALUE.toString())

        expect(deposit[0].toString()).toEqual(eventArgs.id.toString())
        expect(deposit[1].toString()).toEqual(VALUE.toString())
        expect(deposit[2].toLowerCase()).toEqual(ALICE)

        const currentDepositId = await plasmoid.currentDepositId()

        expect(currentDepositId.toNumber()).toEqual(prevDepositId.toNumber() + 1)
      })

      test('Try to add deposit with value == 0 ', async () => {
        await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
        await expect(plasmoid.deposit(new BigNumber(0), {from: ALICE})).rejects.toBeTruthy()
      })
    })

    describe('StartWithdrawal', () => {
      test('Start withdrawal successfully', async () => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
        expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

        await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
        await plasmoid.deposit(VALUE, {from: ALICE})

        const participantAfter = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

        expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
        expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())

        const withdrawalTransaction: WithdrawalTransaction = await accountServiceAtAlice.addWithdrawalTransaction(aliceAsPartyAtAlice.address, VALUE)

        const proof = accountServiceAtAlice.txTree!.proof(withdrawalTransaction.transactionDigest())

        const proofAsString = solUtils.bufferArrayTo0xString(proof)

        const signature = await aliceAsPartyAtAlice.sign(withdrawalTransaction.transactionDigest())

        const checkpointSignature = await sign(CONTRACT_OWNER.toLowerCase(), solUtils.keccak256(solUtils.keccak256FromStrings('transactions'), solUtils.keccak256FromStrings('changes'), solUtils.keccak256FromStrings('accounts')))

        const txCheckpoint = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
          checkpointSignature, {from: CONTRACT_OWNER})

        const eventCheckpointArgs: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint.logs[0].args

        const tx = await plasmoid.startWithdrawal(eventCheckpointArgs.id, new BigNumber(1), VALUE, ALICE, proofAsString, signature)
        const eventStartWithdrawalArgs: PlasmoidWrapper.DidStartWithdrawal = tx.logs[0].args
        const withdrawalQueueIDNow = await plasmoid.withdrawalQueueIDNow()

        expect(eventStartWithdrawalArgs.id.toString()).toEqual('1')
        expect(eventStartWithdrawalArgs.checkpointID.toString()).toEqual('1')
        expect(eventStartWithdrawalArgs.amount.toString()).toEqual(VALUE.toString())
        expect(eventStartWithdrawalArgs.lock.toLowerCase()).toEqual(ALICE)
        expect(eventStartWithdrawalArgs.unlock).toEqual(signature)
        expect(withdrawalQueueIDNow.toString()).toEqual('2')
      })

      test('Provided invalid checkpoint id', async () => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
        expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

        await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
        await plasmoid.deposit(VALUE, {from: ALICE})

        const participantAfter = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

        expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
        expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())

        const withdrawalTransaction: WithdrawalTransaction = await accountServiceAtAlice.addWithdrawalTransaction(aliceAsPartyAtAlice.address, VALUE)

        const proof = accountServiceAtAlice.txTree!.proof(withdrawalTransaction.transactionDigest())

        const proofAsString = solUtils.bufferArrayTo0xString(proof)

        const signature = await aliceAsPartyAtAlice.sign(withdrawalTransaction.transactionDigest())

        const checkpointSignature = await sign(CONTRACT_OWNER.toLowerCase(), solUtils.keccak256(solUtils.keccak256FromStrings('transactions'), solUtils.keccak256FromStrings('changes'), solUtils.keccak256FromStrings('accounts')))

        const txCheckpoint = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
          checkpointSignature, {from: CONTRACT_OWNER})

        const eventCheckpointArgs: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint.logs[0].args

        await expect(plasmoid.startWithdrawal(new BigNumber(-1), new BigNumber(1), VALUE, ALICE, proofAsString, signature)).rejects.toBeTruthy()
      })

      test('Wrong signature', async () => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
        expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

        await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
        await plasmoid.deposit(VALUE, {from: ALICE})

        const participantAfter = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

        expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
        expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())

        const withdrawalTransaction: WithdrawalTransaction = await accountServiceAtAlice.addWithdrawalTransaction(aliceAsPartyAtAlice.address, VALUE)

        const proof = accountServiceAtAlice.txTree!.proof(withdrawalTransaction.transactionDigest())

        const proofAsString = solUtils.bufferArrayTo0xString(proof)

        const checkpointSignature = await sign(CONTRACT_OWNER.toLowerCase(), solUtils.keccak256(solUtils.keccak256FromStrings('transactions'), solUtils.keccak256FromStrings('changes'), solUtils.keccak256FromStrings('accounts')))

        const txCheckpoint = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
          checkpointSignature, {from: CONTRACT_OWNER})

        const eventCheckpointArgs: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint.logs[0].args

        await expect(plasmoid.startWithdrawal(eventCheckpointArgs.id, new BigNumber(1), VALUE, ALICE, proofAsString, '0x12345')).rejects.toBeTruthy()
      })

      test('Wrong amount', async () => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
        expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

        await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
        await plasmoid.deposit(VALUE, {from: ALICE})

        const participantAfter = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

        expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
        expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())

        const withdrawalTransaction: WithdrawalTransaction = await accountServiceAtAlice.addWithdrawalTransaction(aliceAsPartyAtAlice.address, VALUE)

        const proof = accountServiceAtAlice.txTree!.proof(withdrawalTransaction.transactionDigest())

        const proofAsString = solUtils.bufferArrayTo0xString(proof)

        const signature = await aliceAsPartyAtAlice.sign(withdrawalTransaction.transactionDigest())

        const checkpointSignature = await sign(CONTRACT_OWNER.toLowerCase(), solUtils.keccak256(solUtils.keccak256FromStrings('transactions'), solUtils.keccak256FromStrings('changes'), solUtils.keccak256FromStrings('accounts')))

        const txCheckpoint = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
          checkpointSignature, {from: CONTRACT_OWNER})

        const eventCheckpointArgs: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint.logs[0].args

        await expect(plasmoid.startWithdrawal(eventCheckpointArgs.id, new BigNumber(1), new BigNumber(1), ALICE, proofAsString, signature)).rejects.toBeTruthy()

      })

      test('Wrong address', async () => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
        expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

        await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
        await plasmoid.deposit(VALUE, {from: ALICE})

        const participantAfter = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

        expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
        expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())

        const withdrawalTransaction: WithdrawalTransaction = await accountServiceAtAlice.addWithdrawalTransaction(aliceAsPartyAtAlice.address, VALUE)

        const proof = accountServiceAtAlice.txTree!.proof(withdrawalTransaction.transactionDigest())

        const proofAsString = solUtils.bufferArrayTo0xString(proof)

        const signature = await aliceAsPartyAtAlice.sign(withdrawalTransaction.transactionDigest())

        const checkpointSignature = await sign(CONTRACT_OWNER.toLowerCase(), solUtils.keccak256(solUtils.keccak256FromStrings('transactions'), solUtils.keccak256FromStrings('changes'), solUtils.keccak256FromStrings('accounts')))

        const txCheckpoint = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
          checkpointSignature, {from: CONTRACT_OWNER})

        const eventCheckpointArgs: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint.logs[0].args

        await expect(plasmoid.startWithdrawal(eventCheckpointArgs.id, new BigNumber(1), VALUE, BOB, proofAsString, signature)).rejects.toBeTruthy()
      })
    })

    describe('FinaliseWithdrawal', () => {
      // Account service at Alice Machine
      let accountServiceAtAlice: AccountService
      // Account service at Bob Machine
      let accountServiceAtBob: AccountService
      // Account service at Operator Machine
      let accountServiceAtOperator: AccountService

      // Alice user at Alice Machine
      let aliceAsPartyAtAlice: Participant
      // Bob user at Alice Machine
      let bobAsPartyAtAlice: Participant
      // Operator user at Alice Machine
      let operatorAsPartyAtAlice: Participant

      // Alice user at Bob Machine
      let aliceAsPartyAtBob: Participant
      // Bob user at Bob Machine
      let bobAsPartyAtBob: Participant
      // Operator user at Bob Machine
      let operatorAsPartyAtBob: Participant

      // Alice user at Operator Machine
      let aliceAsPartyAtOperator: Participant
      // Bob user at Operator Machine
      let bobAsPartyAtOperator: Participant
      // Operator user at Operator Machine
      let operatorAsPartyAtOperator: Participant

      beforeEach(async () => {
        // Account service at Alice Machine
        accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        // Account service at Bob Machine
        accountServiceAtBob = new AccountService(plasmoid, BOB)
        // Account service at Operator Machine
        accountServiceAtOperator = new AccountService(plasmoid, CONTRACT_OWNER)

        // Alice user at Alice Machine
        aliceAsPartyAtAlice = new Participant(ALICE, plasmoid, accountServiceAtAlice, new BigNumber(90))
        // Bob user at Alice Machine
        bobAsPartyAtAlice = new Participant(BOB, plasmoid, accountServiceAtBob, new BigNumber(10))
        // Operator user at Alice Machine
        operatorAsPartyAtAlice = new Participant(CONTRACT_OWNER, plasmoid, accountServiceAtOperator, new BigNumber(0))

        // Alice user at Bob Machine
        aliceAsPartyAtBob = new Participant(ALICE, plasmoid, accountServiceAtAlice, new BigNumber(90))
        // Bob user at Bob Machine
        bobAsPartyAtBob = new Participant(BOB, plasmoid, accountServiceAtBob, new BigNumber(10))
        // Operator user at Bob Machine
        operatorAsPartyAtBob = new Participant(CONTRACT_OWNER, plasmoid, accountServiceAtOperator, new BigNumber(0))

        // Alice user at Operator Machine
        aliceAsPartyAtOperator = new Participant(ALICE, plasmoid, accountServiceAtAlice, new BigNumber(90))
        // Bob user at Operator Machine
        bobAsPartyAtOperator = new Participant(BOB, plasmoid, accountServiceAtBob, new BigNumber(10))
        // Operator user at Operator Machine
        operatorAsPartyAtOperator = new Participant(CONTRACT_OWNER, plasmoid, accountServiceAtOperator, new BigNumber(0))

        accountServiceAtOperator.addParticipant(aliceAsPartyAtOperator)
        accountServiceAtOperator.addParticipant(bobAsPartyAtOperator)
        accountServiceAtOperator.addParticipant(operatorAsPartyAtOperator)

        accountServiceAtAlice.addParticipant(aliceAsPartyAtAlice)
        accountServiceAtAlice.addParticipant(bobAsPartyAtAlice)
        accountServiceAtAlice.addParticipant(operatorAsPartyAtAlice)

        accountServiceAtBob.addParticipant(aliceAsPartyAtBob)
        accountServiceAtBob.addParticipant(bobAsPartyAtBob)
        accountServiceAtBob.addParticipant(operatorAsPartyAtBob)
      })
      test('Finalise withdrawal successfully', async (done) => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
        expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

        await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
        await plasmoid.deposit(VALUE, {from: ALICE})

        const participantAfter = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

        expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
        expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())

        const withdrawalTransaction: WithdrawalTransaction = await accountServiceAtAlice.addWithdrawalTransaction(aliceAsPartyAtAlice.address, VALUE)

        const proof = accountServiceAtAlice.txTree!.proof(withdrawalTransaction.transactionDigest())

        const proofAsString = solUtils.bufferArrayTo0xString(proof)

        const signature = await aliceAsPartyAtAlice.sign(withdrawalTransaction.transactionDigest())

        const checkpointSignature = await sign(CONTRACT_OWNER.toLowerCase(), solUtils.keccak256(solUtils.keccak256FromStrings('transactions'), solUtils.keccak256FromStrings('changes'), solUtils.keccak256FromStrings('accounts')))

        const txCheckpoint = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
          checkpointSignature, {from: CONTRACT_OWNER})

        const eventCheckpointArgs: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint.logs[0].args

        const tx = await plasmoid.startWithdrawal(eventCheckpointArgs.id, new BigNumber(1), VALUE, ALICE, proofAsString, signature)
        const eventStartWithdrawalArgs: PlasmoidWrapper.DidStartWithdrawal = tx.logs[0].args

        setTimeout(async () => {
          const finaliseTx = await plasmoid.finaliseWithdrawal(eventStartWithdrawalArgs.id)
          const eventFinaliseTxArgs: PlasmoidWrapper.DidFinaliseWithdrawal = finaliseTx.logs[0].args
          expect(eventFinaliseTxArgs.id.toString()).toEqual(eventStartWithdrawalArgs.id.toString())
          done()
        }, 2000)
      })

      test('Withdrawal request does not exists', async (done) => {
        const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
        const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, VALUE)

        const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
        expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

        await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
        await plasmoid.deposit(VALUE, {from: ALICE})

        const participantAfter = await mintableToken.balanceOf(ALICE)
        const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

        expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
        expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())

        const withdrawalTransaction: WithdrawalTransaction = await accountServiceAtAlice.addWithdrawalTransaction(aliceAsPartyAtAlice.address, VALUE)

        const proof = accountServiceAtAlice.txTree!.proof(withdrawalTransaction.transactionDigest())

        const proofAsString = solUtils.bufferArrayTo0xString(proof)

        const signature = await aliceAsPartyAtAlice.sign(withdrawalTransaction.transactionDigest())

        const checkpointSignature = await sign(CONTRACT_OWNER.toLowerCase(), solUtils.keccak256(solUtils.keccak256FromStrings('transactions'), solUtils.keccak256FromStrings('changes'), solUtils.keccak256FromStrings('accounts')))

        const txCheckpoint = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
          checkpointSignature, {from: CONTRACT_OWNER})

        const eventCheckpointArgs: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint.logs[0].args

        await plasmoid.startWithdrawal(eventCheckpointArgs.id, new BigNumber(1), VALUE, ALICE, proofAsString, signature)

        setTimeout(async () => {
          await expect(plasmoid.finaliseWithdrawal(new BigNumber(-1))).rejects.toBeTruthy()
          done()
        }, 2000)
      })

      test('Checkpoint is not valid', async (done) => {
        await mintableToken.approve(plasmoid.address, new BigNumber(90), {from: aliceAsPartyAtAlice.address})
        await aliceAsPartyAtAlice.deposit(new BigNumber(90))

        const depositTransaction: DepositTransaction = await accountServiceAtAlice.addDepositTransaction(aliceAsPartyAtAlice.address, new BigNumber(90))

        await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))
        await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))
        await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))

        const txCheckpoint = await operatorAsPartyAtOperator.makeCheckpoint()

        const txCheckpoint2 = await operatorAsPartyAtOperator.makeCheckpoint()

        const txCheckpointEvents2: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint2.logs[0].args

        const proof = accountServiceAtAlice.txTree!.proof(depositTransaction.transactionDigest())

        const proofAsString = solUtils.bufferArrayTo0xString(proof)

        const tx = solUtils.bufferTo0xString(depositTransaction.transactionDigest())

        const slotPrev = new BigNumber(2)

        const slotCur = new BigNumber(3)

        const key = accountServiceAtAlice.accounts.get(slotPrev.toString())!

        const keyHash = solUtils.keccak256(key)

        // console.log(`key ~ ${key}, keyHash ~ ${solUtils.bufferTo0xString(keyHash)}`)

        const keyProofs = accountServiceAtAlice.accountsTree!.proof(keyHash)

        const proofPrev = solUtils.bufferArrayTo0xString(keyProofs)

        // // //

        const keyCur = accountServiceAtAlice.accounts.get(slotCur.toString())!

        const keyCurHash = solUtils.keccak256(keyCur)

        // console.log(`keyCur ~ ${keyCur}, keyCurHash ~ ${solUtils.bufferTo0xString(keyCurHash)}`)

        const keyCurProofs = accountServiceAtAlice.accountsTree!.proof(keyCurHash)

        const proofCur = solUtils.bufferArrayTo0xString(keyCurProofs)

        const txID = new BigNumber(1)

        const signature = await aliceAsPartyAtAlice.sign(depositTransaction.transactionDigest())

        const tx2 = await plasmoid.invalidate(txCheckpointEvents2.id,
          txID,
          proofAsString,
          solUtils.bufferTo0xString(keyHash),
          proofPrev,
          solUtils.bufferTo0xString(keyCurHash),
          proofCur,
          solUtils.bytesTo0xString(solUtils.stringToBytes('d')),
          depositTransaction.lock,
          new BigNumber(0),
          signature)

        const eventArgs: PlasmoidWrapper.DidInvalidate = tx2.logs[0].args

        expect(eventArgs.checkpointID.toString()).toEqual('2')

        const withdrawalTransaction: WithdrawalTransaction = await accountServiceAtAlice.addWithdrawalTransaction(aliceAsPartyAtAlice.address, new BigNumber(90))

        const proof2 = accountServiceAtAlice.txTree!.proof(withdrawalTransaction.transactionDigest())

        const proofAsString2 = solUtils.bufferArrayTo0xString(proof2)

        // Alice signs transaction digest
        const signature2 = await aliceAsPartyAtAlice.sign(withdrawalTransaction.transactionDigest())

        const startWithdrawTx = await plasmoid.startWithdrawal(eventArgs.checkpointID, new BigNumber(5), new BigNumber(90), ALICE, proofAsString2, signature2)

        const eventWithdrawArgs: PlasmoidWrapper.DidStartWithdrawal = startWithdrawTx.logs[0].args

        setTimeout(async () => {
          await expect(plasmoid.finaliseWithdrawal(eventWithdrawArgs.id)).rejects.toBeTruthy()
          done()
        }, 2000)
      })
    })
  })
})
