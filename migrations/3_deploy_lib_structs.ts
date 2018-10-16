import * as Deployer from 'truffle-deployer'

const LibStructs = artifacts.require('./LibStructs.sol')

module.exports = function (deployer: Deployer) {
  return deployer.deploy(LibStructs)
}
