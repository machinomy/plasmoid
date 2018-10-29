import * as Deployer from 'truffle-deployer'

const ECRecovery = artifacts.require('./ECRecovery.sol')
const TestToken = artifacts.require('./TestToken.sol')


module.exports = async function (deployer: Deployer) {
  // TODO Do we need to link with ECRecovery here?
  await deployer.deploy(ECRecovery)
  await deployer.link(ECRecovery, TestToken)
  return deployer.deploy(TestToken)
}
