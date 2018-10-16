pragma solidity ^0.4.24;

import "./LibStructs.sol";

contract Checkpoint {
    uint256 public checkpointIDNow;

    mapping (uint256 => LibStructs.Checkpoint) public checkpoints;

    constructor () {

    }
}
