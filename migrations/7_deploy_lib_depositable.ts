import * as Deployer from 'truffle-deployer'

const DepositableLib = artifacts.require('./DepositableLib.sol')

module.exports = function (deployer: Deployer) {
  return deployer.deploy(DepositableLib)
}
