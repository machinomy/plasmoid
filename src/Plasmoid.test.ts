import * as contracts from './index'

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

  test('deposit', async () => {
    const participantBefore = await mintableToken.balanceOf(participant)
    const accountBefore = await plasmoid.balanceOf(participant)
    const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
    expect(accountBefore.toNumber()).toEqual(0)
    expect(plasmoidBalanceBefore.toNumber()).toEqual(0)

    await mintableToken.approve(plasmoid.address, VALUE, {from: participant})
    await plasmoid.deposit(VALUE, { from: participant })

    const participantAfter = await mintableToken.balanceOf(participant)
    const accountAfter = await plasmoid.balanceOf(participant)
    const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

    expect(participantAfter.toNumber()).toEqual(participantBefore.toNumber() - VALUE)
    expect(accountAfter.toNumber()).toEqual(accountBefore.toNumber() + VALUE)
    expect(plasmoidBalanceAfter.toNumber()).toEqual(VALUE)
  })

  test('withdraw', async () => {
    await mintableToken.approve(plasmoid.address, VALUE, {from: participant})
    await plasmoid.deposit(VALUE, { from: participant })

    const participantBefore = await mintableToken.balanceOf(participant)
    const accountBefore = await plasmoid.balanceOf(participant)
    const plasmoidBalanceBefore = await mintableToken.balanceOf(plasmoid.address)
    expect(participantBefore.toNumber()).toEqual(MINTED - VALUE)
    expect(accountBefore.toNumber()).toEqual(VALUE)
    expect(plasmoidBalanceBefore.toNumber()).toEqual(VALUE)

    await plasmoid.withdraw({from: participant})

    const participantAfter = await mintableToken.balanceOf(participant)
    const accountAfter = await plasmoid.balanceOf(participant)
    const plasmoidBalanceAfter = await mintableToken.balanceOf(plasmoid.address)

    expect(participantAfter.toNumber()).toEqual(MINTED)
    expect(accountAfter.toNumber()).toEqual(0)
    expect(plasmoidBalanceAfter.toNumber()).toEqual(0)
  })
})
