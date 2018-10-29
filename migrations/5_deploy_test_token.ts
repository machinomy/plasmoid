import * as Deployer from 'truffle-deployer'

const ECRecovery = artifacts.require('./ECRecovery.sol')
const TestToken = artifacts.require('./TestToken.sol')

module.exports = async function (deployer: Deployer) {
  await deployer.deploy(ECRecovery)
  await deployer.link(ECRecovery, TestToken)
  return deployer.deploy(TestToken)
}
