pragma solidity ^0.4.25;

library LibStructs {
    struct WithdrawalRequest {
        uint256 id;
        uint256 checkpointID;
        uint256 amount;
        address lock;
        uint256 timestamp;
    }

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

    struct StateQueryRequest {
        uint256 id;
        uint256 checkpointID;
        uint256 slotID;
        uint256 timestamp;
    }

    struct FastWithdrawal {
        uint256 id;
        bytes32 slotHash;
        uint256 amount;
        uint256 timestamp;
    }

    struct Transaction {
        uint256 id;
        uint256 checkpointID;
        uint256 txID;
        uint256 timestamp;
    }

    struct Deposit {
        uint256 id;
        uint256 amount;
        address lock;
        uint256 timestamp;
    }

    struct DepositWithdrawalRequest {
        uint256 id;
        uint256 depositID;
        bytes unlock;
        address owner;
        uint256 checkpointID;
    }

    struct Checkpoint {
        uint256 id;
        bytes32 transactionsMerkleRoot;
        bytes32 changesSparseMerkleRoot;
        bytes32 accountsStateSparseMerkleRoot;
        bool valid;
    }

    enum SignatureType {
        Caller, // 0x00
        EthSign // 0x01
    }
}
