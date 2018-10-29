pragma solidity ^0.4.25;

library WithdrawableLib {
    struct WithdrawalRequest {
        uint256 id;
        uint256 checkpointID;
        uint256 amount;
        address lock;
        uint256 timestamp;
    }
}
