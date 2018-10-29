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
import { DepositTransaction} from './DepositTransaction'

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

  describe('Invalidate checkpoint', () => {
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

    describe('Invalidate', () => {
      test('Do not halt - system state is good', async () => {
        await mintableToken.approve(plasmoid.address, new BigNumber(90), {from: aliceAsPartyAtAlice.address})
        await aliceAsPartyAtAlice.deposit(new BigNumber(90))

        const depositTransaction: DepositTransaction = await accountServiceAtAlice.addDepositTransaction(aliceAsPartyAtAlice.address, new BigNumber(90))

        await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))
        await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))
        await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))
        await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))

        const txCheckpoint = await operatorAsPartyAtOperator.makeCheckpoint()

        const txCheckpoint2 = await operatorAsPartyAtOperator.makeCheckpoint()

        const txCheckpointEvents2: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint2.logs[0].args

        const proof = accountServiceAtAlice.txTree!.proof(depositTransaction.transactionDigest())

        const proofAsString = solUtils.bufferArrayTo0xString(proof)

        const tx = solUtils.bufferTo0xString(depositTransaction.transactionDigest())

        // this.accounts.set(slotId.toString(), Buffer.concat([solUtils.stringToBuffer(account), solUtils.bignumberToUint256(amount)]))

        const slotPrev = new BigNumber(1)

        const slotCur = new BigNumber(2)

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

        await expect(plasmoid.invalidate(txCheckpointEvents2.id,
          txID,
          proofAsString,
          solUtils.bufferTo0xString(keyHash),
          proofPrev,
          solUtils.bufferTo0xString(keyCurHash),
          proofCur,
          solUtils.bytesTo0xString(solUtils.stringToBytes('d')),
          depositTransaction.lock,
          depositTransaction.amount,
          signature)).rejects.toBeTruthy()
      })

      test('Halt - provided signature is not good', async () => {
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

        const signature = await aliceAsPartyAtAlice.sign('0xbad')

        const tx2 = await plasmoid.invalidate(txCheckpointEvents2.id,
          txID,
          proofAsString,
          solUtils.bufferTo0xString(keyHash),
          proofPrev,
          solUtils.bufferTo0xString(keyCurHash),
          proofCur,
          solUtils.bytesTo0xString(solUtils.stringToBytes('d')),
          depositTransaction.lock,
          depositTransaction.amount,
          signature)

        const eventArgs: PlasmoidWrapper.DidInvalidate = tx2.logs[0].args

        const isHalted = await plasmoid.halt()
        const isValidCheckpoint = (await plasmoid.checkpoints(txCheckpointEvents2.id))[4]

        expect(eventArgs.checkpointID.toString()).toEqual('2')
        expect(isValidCheckpoint).toBeFalsy()
        expect(isHalted).toBeTruthy()
      })

      test('Halt - provided lock is not good', async () => {
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
          ALIEN,
          new BigNumber(0),
          signature)

        const eventArgs: PlasmoidWrapper.DidInvalidate = tx2.logs[0].args

        const isHalted = await plasmoid.halt()
        const isValidCheckpoint = (await plasmoid.checkpoints(txCheckpointEvents2.id))[4]

        expect(eventArgs.checkpointID.toString()).toEqual('2')
        expect(isValidCheckpoint).toBeFalsy()
        expect(isHalted).toBeTruthy()
      })

      test('Halt - provided tx amount is not good', async () => {
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

        const isHalted = await plasmoid.halt()
        const isValidCheckpoint = (await plasmoid.checkpoints(txCheckpointEvents2.id))[4]

        expect(eventArgs.checkpointID.toString()).toEqual('2')
        expect(isValidCheckpoint).toBeFalsy()
        expect(isHalted).toBeTruthy()
      })

      test('Provided cur slot does not exists in accounts states sparse tree merkle root. Bad proof', async () => {
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

        const txID = new BigNumber(1)

        const signature = await aliceAsPartyAtAlice.sign(depositTransaction.transactionDigest())

        await expect(plasmoid.invalidate(txCheckpointEvents2.id,
          txID,
          proofAsString,
          solUtils.bufferTo0xString(keyHash),
          proofPrev,
          solUtils.bufferTo0xString(keyCurHash),
          '0xbad',
          solUtils.bytesTo0xString(solUtils.stringToBytes('d')),
          depositTransaction.lock,
          depositTransaction.amount,
          signature)).rejects.toBeTruthy()
      })

      test('Provided prev slot does not exists in accounts states sparse tree merkle root. Bad proof', async () => {
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

        const keyCurProofs = accountServiceAtAlice.accountsTree!.proof(keyCurHash)

        const proofCur = solUtils.bufferArrayTo0xString(keyCurProofs)

        const txID = new BigNumber(1)

        const signature = await aliceAsPartyAtAlice.sign(depositTransaction.transactionDigest())

        await expect(plasmoid.invalidate(txCheckpointEvents2.id,
          txID,
          proofAsString,
          solUtils.bufferTo0xString(keyHash),
          '0xbad',
          solUtils.bufferTo0xString(keyCurHash),
          proofCur,
          solUtils.bytesTo0xString(solUtils.stringToBytes('d')),
          depositTransaction.lock,
          depositTransaction.amount,
          signature)).rejects.toBeTruthy()
      })

      test('Tx does not exists in transactionsMerkleRoot. Bad proof', async () => {
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

        const keyCurProofs = accountServiceAtAlice.accountsTree!.proof(keyCurHash)

        const proofCur = solUtils.bufferArrayTo0xString(keyCurProofs)

        const txID = new BigNumber(1)

        const signature = await aliceAsPartyAtAlice.sign(depositTransaction.transactionDigest())

        await expect(plasmoid.invalidate(txCheckpointEvents2.id,
          txID,
          '0xbad',
          solUtils.bufferTo0xString(keyHash),
          proofPrev,
          solUtils.bufferTo0xString(keyCurHash),
          proofCur,
          solUtils.bytesTo0xString(solUtils.stringToBytes('d')),
          depositTransaction.lock,
          depositTransaction.amount,
          signature)).rejects.toBeTruthy()
      })

      test('Checkpoint does not exists', async () => {
        await expect(plasmoid.invalidate(new BigNumber(-1),
          new BigNumber(1),
          '0xbad',
          solUtils.bytesTo0xString(solUtils.stringToBytes('hash')),
          '0xbad',
          solUtils.bytesTo0xString(solUtils.stringToBytes('hash')),
          '0xbad',
          solUtils.bytesTo0xString(solUtils.stringToBytes('hash')),
          '0x333',
          new BigNumber(100),
          '0x0abc')).rejects.toBeTruthy()
      })

      test('Previous checkpoint does not exists', async () => {
        await mintableToken.approve(plasmoid.address, new BigNumber(90), {from: aliceAsPartyAtAlice.address})
        await aliceAsPartyAtAlice.deposit(new BigNumber(90))

        const depositTransaction: DepositTransaction = await accountServiceAtAlice.addDepositTransaction(aliceAsPartyAtAlice.address, new BigNumber(90))

        await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))
        await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))
        await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))

        const proof = accountServiceAtAlice.txTree!.proof(depositTransaction.transactionDigest())

        const proofAsString = solUtils.bufferArrayTo0xString(proof)

        const txCheckpoint = await operatorAsPartyAtOperator.makeCheckpoint()

        const txCheckpointEvents: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint.logs[0].args

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

        await expect(plasmoid.invalidate(txCheckpointEvents.id,
          txID,
          proofAsString,
          solUtils.bufferTo0xString(keyHash),
          proofPrev,
          solUtils.bufferTo0xString(keyCurHash),
          proofCur,
          solUtils.bytesTo0xString(solUtils.stringToBytes('d')),
          depositTransaction.lock,
          depositTransaction.amount,
          signature)).rejects.toBeTruthy()
      })
    })
  })
})
