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

  describe('Ensuring availability of the checkpointed data', () => {
    describe('QuerySlot', () => {
      test('All right', async () => {
        const checkpointSignature = await sign(CONTRACT_OWNER.toLowerCase(), solUtils.keccak256(solUtils.keccak256FromStrings('transactions'), solUtils.keccak256FromStrings('changes'), solUtils.keccak256FromStrings('accounts')))

        const txCheckpoint = await plasmoid.makeCheckpoint(solUtils.bufferTo0xString(solUtils.keccak256FromStrings('transactions')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('changes')),
          solUtils.bufferTo0xString(solUtils.keccak256FromStrings('accounts')),
          checkpointSignature, { from: CONTRACT_OWNER })

        const eventCheckpointArgs: PlasmoidWrapper.DidMakeCheckpoint = txCheckpoint.logs[0].args

        const tx = await plasmoid.querySlot(eventCheckpointArgs.id, new BigNumber(2))
        const event = tx.logs[0]
        const eventArgs: PlasmoidWrapper.DidQuerySlot = event.args

        const stateQueryQueueIDNow = await plasmoid.stateQueryQueueIDNow()

        expect(PlasmoidWrapper.isDidQuerySlotEvent(event))
        expect(eventArgs.checkpointID.toString()).toEqual(eventCheckpointArgs.id.toString())
        expect(eventArgs.slotID.toString()).toEqual('2')
        expect(stateQueryQueueIDNow.toString()).toEqual('2')
      })

      test('Checkpoint does not exists', async () => {
        await expect(plasmoid.querySlot(new BigNumber(-1), new BigNumber(2))).rejects.toBeTruthy()
      })
    })
  })

})
