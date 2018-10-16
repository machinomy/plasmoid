import * as Deployer from 'truffle-deployer'

const LibService = artifacts.require('./LibService.sol')

module.exports = function (deployer: Deployer) {
  return deployer.deploy(LibService)
}
