pragma solidity ^0.4.25;

import "./LibCheckpointed.sol";

contract Checkpointed {
    uint256 public checkpointIDNow;

    mapping (uint256 => LibCheckpointed.Checkpoint) public checkpoints;
}
