import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as contracts from '../src/index'

chai.use(asPromised)

const assert = chai.assert

const Plasmoid = artifacts.require<contracts.Plasmoid.Contract>('Plasmoid.sol')
const MintableToken = artifacts.require<contracts.MintableToken.Contract>('MintableToken.sol')

contract('Basic', accounts => {
  let tokenOwner = accounts[0]
  let addressA = accounts[4]

  const value = 100

  specify('Basic test', async () => {
    let mintableToken = await MintableToken.new({from: tokenOwner})
    let plasmoid = await Plasmoid.new(mintableToken.address)

    await mintableToken.mint(addressA, 1000, {from: tokenOwner})
    await mintableToken.finishMinting({from: tokenOwner})
    await mintableToken.approve(plasmoid.address, value, {from: addressA})
    const beforeWithdrawA = mintableToken.balanceOf(addressA)
    await plasmoid.deposit(value, { from: addressA })
    assert.equal((await plasmoid.balanceOf(addressA)).toString(), value.toString())
    await plasmoid.withdraw({from: addressA})
    const afterWithdrawA = mintableToken.balanceOf(addressA)
    assert.equal(afterWithdrawA.toString(), beforeWithdrawA.toString())
  })
})
