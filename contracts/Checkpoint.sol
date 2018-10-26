pragma solidity ^0.4.25;

import "./LibCheckpointed.sol";

contract Checkpointed {
    uint256 public currentCheckpointId;

    mapping (uint256 => LibCheckpointed.Checkpoint) public checkpoints;

    constructor () {
        currentCheckpointId = 1;
    }
}
