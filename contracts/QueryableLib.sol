pragma solidity ^0.4.25;

library QueryableLib {
    struct StateQueryRequest {
        uint256 id;
        uint256 checkpointID;
        uint256 slotID;
        uint256 timestamp;
    }
}
