pragma solidity ^0.4.25;

library LibStructs {
    struct Slot {
        uint256 id;
        uint256 amount;
        bytes slotType;
        address lock;
    }

    struct Lock {
        address lockType;
        bytes data;
    }

    struct Transaction {
        uint256 id;
        uint256 checkpointID;
        uint256 txID;
        uint256 timestamp;
    }
}
