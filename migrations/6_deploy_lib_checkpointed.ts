import * as Deployer from 'truffle-deployer'

const LibCheckpointed = artifacts.require('./LibCheckpointed.sol')

module.exports = function (deployer: Deployer) {
  return deployer.deploy(LibCheckpointed)
}
