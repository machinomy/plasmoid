import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as contracts from '../src/index'

chai.use(asPromised)

const assert = chai.assert

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

  specify('deposit', async () => {
    const participantBefore = await mintableToken.balanceOf(participant)
    const accountBefore = await plasmoid.balanceOf(participant)
    const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
    assert.equal(accountBefore.toNumber(), 0)
    assert.equal(plasmoidBalanceBefore.toNumber(), 0)

    await mintableToken.approve(plasmoid.address, VALUE, {from: participant})
    await plasmoid.deposit(VALUE, { from: participant })

    const participantAfter = await mintableToken.balanceOf(participant)
    const accountAfter = await plasmoid.balanceOf(participant)
    const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

    assert.equal(participantAfter.toNumber(), participantBefore.toNumber() - VALUE)
    assert.equal(accountAfter.toNumber(), accountBefore.toNumber() + VALUE)
    assert.equal(plasmoidBalanceAfter.toNumber(), VALUE)
  })

  specify('withdraw', async () => {
    await mintableToken.approve(plasmoid.address, VALUE, {from: participant})
    await plasmoid.deposit(VALUE, { from: participant })

    const participantBefore = await mintableToken.balanceOf(participant)
    const accountBefore = await plasmoid.balanceOf(participant)
    const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
    assert.equal(participantBefore.toNumber(), MINTED - VALUE)
    assert.equal(accountBefore.toNumber(), VALUE)
    assert.equal(plasmoidBalanceBefore.toNumber(), VALUE)

    await plasmoid.withdraw({from: participant})

    const participantAfter = await mintableToken.balanceOf(participant)
    const accountAfter = await plasmoid.balanceOf(participant)
    const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)
    assert.equal(participantAfter.toNumber(), MINTED)
    assert.equal(accountAfter.toNumber(), 0)
    assert.equal(plasmoidBalanceAfter.toNumber(), 0)
  })
})
