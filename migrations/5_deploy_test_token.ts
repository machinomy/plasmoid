import * as Deployer from 'truffle-deployer'

const ECRecovery = artifacts.require('./ECRecovery.sol')
const TestToken = artifacts.require('./TestToken.sol')

module.exports = function (deployer: Deployer) {
  return deployer.deploy(ECRecovery).then(() => {
    return deployer.link(ECRecovery, TestToken).then(() => {
      return deployer.deploy(TestToken)
    })
  })
}
