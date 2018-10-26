pragma solidity ^0.4.25;

library LibCheckpointed {
    struct Checkpoint {
        uint256 id;
        bytes32 transactionsMerkleRoot;
        bytes32 changesSparseMerkleRoot;
        bytes32 accountsStateSparseMerkleRoot;
        bool valid;
    }
}