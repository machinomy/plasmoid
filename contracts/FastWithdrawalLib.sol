pragma solidity ^0.4.25;

library FastWithdrawalLib {
    struct FastWithdrawal {
        uint256 id;
        bytes32 slotHash;
        uint256 amount;
        uint256 timestamp;
    }
}
