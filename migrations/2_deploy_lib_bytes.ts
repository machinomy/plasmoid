import * as Deployer from 'truffle-deployer'

const LibBytes = artifacts.require('./LibBytes.sol')

module.exports = function (deployer: Deployer) {
  return deployer.deploy(LibBytes)
}
