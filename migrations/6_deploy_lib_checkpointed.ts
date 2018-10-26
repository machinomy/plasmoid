import * as Deployer from 'truffle-deployer'

const LibCheckpointed = artifacts.require('./CheckpointedLib.sol')

module.exports = function (deployer: Deployer) {
  return deployer.deploy(LibCheckpointed)
}
