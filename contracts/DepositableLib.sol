pragma solidity ^0.4.25;

library DepositableLib {
    struct Deposit {
        uint256 id;
        uint256 amount;
        address lock;
        uint256 timestamp;
    }
}
