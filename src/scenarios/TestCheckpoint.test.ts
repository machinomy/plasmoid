import Logger from '@machinomy/logger'
import { BigNumber } from 'bignumber.js'
import PlasmoidWrapper from '../../build/wrappers/Plasmoid'
import TestToken from '../../build/wrappers/TestToken'
import { AccountService } from '../AccountService'
import * as contracts from '../index'
import { Participant } from '../Participant'
import * as solUtils from '../SolidityUtils'
import { WithdrawalTransaction } from '../WithdrawalTransaction'

const Plasmoid = artifacts.require<contracts.Plasmoid.Contract>('Plasmoid.sol')
const MintableToken = artifacts.require<TestToken.Contract>('TestToken.sol')
const LibBytes = artifacts.require('LibBytes.sol')
const LibService = artifacts.require('LibService.sol')
const LibStructs = artifacts.require('LibStructs.sol')
const LibCheckpointed = artifacts.require('CheckpointedLib.sol')
const LibDepositable = artifacts.require('DepositableLib.sol')
const Depositable = artifacts.require('Depositable.sol')
const Queryable = artifacts.require('Queryable.sol')

const MINTED = new BigNumber(1000)
const VALUE = new BigNumber(100)

const LOG = new Logger('plasmoid')

Plasmoid.link(LibBytes)
Plasmoid.link(LibService)
Plasmoid.link(LibStructs)
Plasmoid.link(LibCheckpointed)
Plasmoid.link(LibDepositable)
// Plasmoid.link(Depositable)
// Plasmoid.link(Queryable)

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

  beforeEach(async () => {
    const settlementPeriod: BigNumber = new BigNumber(1)

    mintableToken = await MintableToken.new({from: TOKEN_OWNER})
    plasmoid = await Plasmoid.new(mintableToken.address,
      settlementPeriod,
      settlementPeriod,
      settlementPeriod,
      settlementPeriod,
      {from: CONTRACT_OWNER})

    LOG.info(`Plasmoid address: ${ plasmoid.address }`)

    await mintableToken.mint(ALICE, MINTED, {from: TOKEN_OWNER})
    await mintableToken.finishMinting({from: TOKEN_OWNER})

    // const tx = await mintableToken.balanceOf(ALICE)
    // console.log(tx.toString())
  })

  describe('TestCheckpoint', () => {
    test('Scenario', async () => {
      // Account service at Alice Machine
      const accountServiceAtAlice = new AccountService(plasmoid, ALICE)
      // Account service at Bob Machine
      const accountServiceAtBob = new AccountService(plasmoid, BOB)
      // Account service at Operator Machine
      const accountServiceAtOperator = new AccountService(plasmoid, CONTRACT_OWNER)

      // Alice user at Alice Machine
      const aliceAsPartyAtAlice: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, new BigNumber(90))
      // Bob user at Alice Machine
      const bobAsPartyAtAlice: Participant = new Participant(BOB, plasmoid, accountServiceAtBob, new BigNumber(10))
      // Operator user at Alice Machine
      const operatorAsPartyAtAlice: Participant = new Participant(CONTRACT_OWNER, plasmoid, accountServiceAtOperator, new BigNumber(0))

      // Alice user at Bob Machine
      const aliceAsPartyAtBob: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, new BigNumber(90))
      // Bob user at Bob Machine
      const bobAsPartyAtBob: Participant = new Participant(BOB, plasmoid, accountServiceAtBob, new BigNumber(10))
      // Operator user at Bob Machine
      const operatorAsPartyAtBob: Participant = new Participant(CONTRACT_OWNER, plasmoid, accountServiceAtOperator, new BigNumber(0))

      // Alice user at Operator Machine
      const aliceAsPartyAtOperator: Participant = new Participant(ALICE, plasmoid, accountServiceAtAlice, new BigNumber(90))
      // Bob user at Operator Machine
      const bobAsPartyAtOperator: Participant = new Participant(BOB, plasmoid, accountServiceAtBob, new BigNumber(10))
      // Operator user at Operator Machine
      const operatorAsPartyAtOperator: Participant = new Participant(CONTRACT_OWNER, plasmoid, accountServiceAtOperator, new BigNumber(0))

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
      await mintableToken.approve(plasmoid.address, new BigNumber(90), {from: aliceAsPartyAtAlice.address})
      const txDeposit = await aliceAsPartyAtAlice.deposit(new BigNumber(90))

      // PlasmoidWrapper.printEvents(txDeposit)

      // await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))
      //
      // await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))
      //
      // await accountServiceAtAlice.addDepositTransaction(accountServiceAtAlice.participantAddress, new BigNumber(90))
      //
      // // Operator makes checkpoint
      // const txCheckpoint = await operatorAsPartyAtOperator.makeCheckpoint()
      //
      // // PlasmoidWrapper.printEvents(txCheckpoint)
      //
      // const txCheckpointEvents: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint.logs[0].args
      //
      // // Alice want to withdraw, add withdrawal transaction to tx array
      // const withdrawalTransaction: WithdrawalTransaction = await accountServiceAtAlice.addWithdrawalTransaction(aliceAsPartyAtAlice.address, new BigNumber(90))
      //
      // // Get proof for hash of Alice's transaction
      // const proof = accountServiceAtAlice.txTree!.proof(withdrawalTransaction.transactionDigest())
      //
      // // Get proof for hash of Alice's transaction as string
      // const proofAsString = solUtils.bufferArrayTo0xString(proof)
      //
      // // Alice signs transaction digest
      // const signature = await aliceAsPartyAtAlice.sign(withdrawalTransaction.transactionDigest())
      //
      // // Alice starts withdrawal
      // const txStartWithdrawal = await aliceAsPartyAtAlice.startWithdrawal(txCheckpointEvents.id as BigNumber, new BigNumber(1), new BigNumber(90), aliceAsPartyAtAlice.address, proofAsString, signature)
      //
      // // PlasmoidWrapper.printEvents(txStartWithdrawal)
      //
      // const txWithdrawalEvents: PlasmoidWrapper.DidStartWithdrawal = txStartWithdrawal.logs[0].args
      //
      // // Alice finalise withdrawal
      // const txFinaliseWithdrawal = await aliceAsPartyAtAlice.finaliseWithdrawal(txWithdrawalEvents.id as BigNumber)
      //
      // // PlasmoidWrapper.printEvents(txFinaliseWithdrawal)
      //
      // const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
      // const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
      // expect(plasmoidBalanceBefore.toNumber()).toEqual(0)
      //
      // await mintableToken.approve(plasmoid.address, VALUE, {from: ALICE})
      // await plasmoid.deposit(VALUE, {from: ALICE})
      //
      // const participantAfter = await mintableToken.balanceOf(ALICE)
      // const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)
      //
      // expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
      // expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())
    })
  })
})
