pragma solidity ^0.4.25;

library DepositWithdrawLib {
    struct DepositWithdrawalRequest {
        uint256 id;
        uint256 depositID;
        bytes unlock;
        address owner;
        uint256 checkpointID;
    }
}
