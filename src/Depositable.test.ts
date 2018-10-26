import { AccountService } from './AccountService'
import { DepositTransaction } from './DepositTransaction'
import * as contracts from './index'
import { BigNumber } from 'bignumber.js'
import TestToken from '../build/wrappers/TestToken'
import PlasmoidWrapper from '../build/wrappers/Plasmoid'
import { Buffer } from 'safe-buffer'
import Logger from '@machinomy/logger'
import * as Web3 from 'web3'
import { Participant } from './Participant'
import { PlasmaState } from './PlasmaState'
import * as solUtils from './SolidityUtils'
import { WithdrawalTransaction } from './WithdrawalTransaction'

const ethSigUtil = require('eth-sig-util')


const Depositable = artifacts.require<contracts.Depositable.Contract>('Depositable.sol')
const MintableToken = artifacts.require<TestToken.Contract>('TestToken.sol')
const LibService = artifacts.require('LibService.sol')

const MINTED = new BigNumber(1000)
const VALUE = new BigNumber(100)

const LOG = new Logger('plasmoid')

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))

let accountsState: Map<string, PlasmaState> = new Map()

Depositable.link(LibService)

contract('Depositable', accounts => {
  let mintableToken: TestToken.Contract
  let depositable: contracts.Depositable.Contract

  const ALICE: string = accounts[1].toLowerCase()
  const TOKEN_OWNER: string = accounts[0].toLowerCase()
  const CONTRACT_OWNER: string = accounts[4].toLowerCase()

  beforeEach(async () => {
    const settlementPeriod: BigNumber = new BigNumber(1)

    mintableToken = await MintableToken.new({ from: TOKEN_OWNER })
    depositable = await Depositable.new(settlementPeriod, mintableToken.address, { from: CONTRACT_OWNER })

    await mintableToken.mint(ALICE, MINTED, { from: TOKEN_OWNER })
    await mintableToken.finishMinting({ from: TOKEN_OWNER })
  })

  describe('deposit', () => {
    test('Transfer token to contract', async () => {
      const participantBefore: BigNumber = await mintableToken.balanceOf(ALICE)
      const plasmoidBalanceBefore = await mintableToken.balanceOf(depositable.address)
      expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

      await mintableToken.approve(depositable.address, VALUE, { from: ALICE })
      await depositable.deposit(VALUE, { from: ALICE })

      const participantAfter = await mintableToken.balanceOf(ALICE)
      const plasmoidBalanceAfter = await mintableToken.balanceOf(depositable.address)

      expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE.toNumber())
      expect(plasmoidBalanceAfter.toString()).toEqual(VALUE.toString())
    })
  })
})
