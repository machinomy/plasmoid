pragma solidity ^0.4.25;

import "./LibStructs.sol";

contract Checkpointed {
    uint256 public checkpointIDNow;

    mapping (uint256 => LibStructs.Checkpoint) public checkpoints;
}
