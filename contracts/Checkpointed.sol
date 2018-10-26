pragma solidity ^0.4.25;

import "./CheckpointedLib.sol";

contract Checkpointed {
    uint256 public currentCheckpointId;

    mapping (uint256 => CheckpointedLib.Checkpoint) public checkpoints;

    constructor () public {
        currentCheckpointId = 1;
    }
}
