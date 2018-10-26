pragma solidity ^0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./DepositWithdraw.sol";
import "./LibBytes.sol";
import "./LibStructs.sol";
import "./LibService.sol";
import "./LibCheckpointed.sol";
import "./Depositable.sol";

contract Plasmoid is Ownable, DepositWithdraw {
    using SafeMath for uint256;
    using LibBytes for bytes;

    uint256 public settlingPeriod;
    uint256 public withdrawalPeriod;
    uint256 public stateQueryPeriod;
    uint256 public fastWithdrawalPeriod;

    uint256 public withdrawalQueueIDNow;
    uint256 public stateQueryQueueIDNow;
    uint256 public fastWithdrawalIDNow;

    mapping (uint256 => LibStructs.WithdrawalRequest) public withdrawalQueue;
    mapping (uint256 => LibStructs.StateQueryRequest) public stateQueryQueue;
    mapping (uint256 => LibStructs.FastWithdrawal) public fastWithdrawals;
    mapping (uint256 => LibStructs.Transaction) public transactions;
    mapping (address => bool) public trustedTransactionsList;

    event DidQuerySlot(uint256 id, uint256 checkpointID, uint256 slotID, uint256 timestamp);
    event DidResponseQueryState(uint64 id);
    event DidMakeCheckpoint(uint256 id);
    event DidStartFastWithdrawal(uint256 id, bytes32 slotHash, uint256 amount, uint256 timestamp);
    event DidFinaliseFastWithdrawal(uint256 id);
    event DidStartWithdrawal(uint256 id, uint256 checkpointID, uint256 amount, address lock, bytes unlock, uint256 timestamp);
    event DidFinaliseWithdrawal(uint256 id);
    event DidInvalidate(uint256 checkpointID);

    bool public halt = false;

    constructor (address _tokenAddress, uint256 _settlingPeriod, uint256 _depositWithdrawalPeriod, uint256 _withdrawalPeriod, uint256 _stateQueryPeriod) public Ownable() DepositWithdraw() {
        token = StandardToken(_tokenAddress);
        withdrawalQueueIDNow = 1;
        stateQueryQueueIDNow = 1;
        fastWithdrawalIDNow = 1;

        require(_settlingPeriod > 0, "Settling period must be > 0");
        require(_depositWithdrawalPeriod > 0, "Deposit withdrawal period must be > 0");
        require(_withdrawalPeriod > 0, "Withdrawal period must be > 0");
        require(_stateQueryPeriod > 0, "State query period must be > 0");

        settlingPeriod = _settlingPeriod;
        depositWithdrawalPeriod = _depositWithdrawalPeriod;
        withdrawalPeriod = _withdrawalPeriod;
        stateQueryPeriod = _stateQueryPeriod;
    }

    function depositDigest (address _lock, uint256 _amount) public view returns (bytes32) {
        return keccak256(abi.encodePacked("d", _lock, _amount));
    }

    function withdrawalDigest (address _lock, uint256 _amount) public view returns (bytes32) {
        return keccak256(abi.encodePacked("w", _lock, _amount));
    }

    function accountsDigest (uint256 _amount, address _owner) public view returns (bytes32) {
        return keccak256(abi.encodePacked(_amount, _owner));
    }

    function makeCheckpoint (bytes32 _transactionsMerkleRoot, bytes32 _changesSparseMerkleRoot, bytes32 _accountsStateSparseMerkleRoot, bytes signature) public {
        bytes32 hash = keccak256(abi.encodePacked(_transactionsMerkleRoot, _changesSparseMerkleRoot, _accountsStateSparseMerkleRoot));
        require(LibService.isValidSignature(hash, this.owner(), signature), "makeCheckpoint: Signature is not valid");
        checkpoints[currentCheckpointId] = LibCheckpointed.Checkpoint({ id: currentCheckpointId,
                                                    transactionsMerkleRoot: _transactionsMerkleRoot,
                                                    changesSparseMerkleRoot: _changesSparseMerkleRoot,
                                                    accountsStateSparseMerkleRoot: _accountsStateSparseMerkleRoot,
                                                    valid: true });

        emit DidMakeCheckpoint(currentCheckpointId);

        currentCheckpointId = currentCheckpointId.add(1);
    }

    /// @notice Initiate withdrawal from the contract.
    /// @notice Validate the slot is in the current checkpoint, add the request to a withdrawQueue.
    /// @param _checkpointID checkpointID
    /// @param _amount amount
    /// @param _lock lock
    /// @param _proof proof
    /// @param _unlock unlock
    function startWithdrawal (uint256 _checkpointID, uint64 _slotID, uint256 _amount, address _lock, bytes _proof, bytes _unlock) {
        bytes32 hash = keccak256(abi.encodePacked("w", _lock, _amount));

        require(checkpoints[_checkpointID].id != 0, "startWithdrawal: Checkpoint does not exists");
        require(LibService.isValidSignature(hash, _lock, _unlock), "startWithdrawal: Signature is not valid");

        withdrawalQueue[withdrawalQueueIDNow] = LibStructs.WithdrawalRequest({ id: withdrawalQueueIDNow, checkpointID: _checkpointID, amount: _amount, lock: _lock, timestamp: block.timestamp });

        emit DidStartWithdrawal(withdrawalQueueIDNow, _checkpointID, _amount, _lock, _unlock, withdrawalQueue[withdrawalQueueIDNow].timestamp);

        withdrawalQueueIDNow = withdrawalQueueIDNow.add(1);
    }

    /// @notice Remove withdrawal attempt if the checkpoint is invalid.
    /// @param withdrawalID Withdrawal ID
    function revokeWithdrawal (uint256 withdrawalID) {
        LibStructs.WithdrawalRequest storage withdrawalRequest = withdrawalQueue[withdrawalID];
//        require(withdrawalRequest block.timestamp);
    }

    /// @notice If the withdrawal has not been challenged during a withdrawal window, one could freely exit the contract.
    /// @param withdrawalID Withdrawal ID
    function finaliseWithdrawal (uint256 withdrawalID) {
        LibStructs.WithdrawalRequest memory withdrawalRequest = withdrawalQueue[withdrawalID];

        require(withdrawalRequest.id != 0, "finaliseWithdrawal: Withdrawal request does not exists");

        uint256 checkpointID = withdrawalRequest.checkpointID;
        LibCheckpointed.Checkpoint storage checkpoint = checkpoints[checkpointID];

        require(checkpoint.id != 0, "finaliseWithdrawal: Checkpoint does not exists");
        require(checkpoint.valid == true, "finaliseWithdrawal: Checkpoint is not valid");

        uint256 amount = withdrawalRequest.amount;
        address owner = withdrawalRequest.lock;

        require(token.transfer(owner, amount), "finaliseWithdrawal: Can not transfer tokens to owner");

        emit DidFinaliseWithdrawal(withdrawalID);
    }

    /// @notice Ask the operator for contents of the slot in the checkpoint.
    function querySlot (uint256 checkpointID, uint64 slotID) {
        require(checkpoints[checkpointID].id != 0, "querySlot: Checkpoint does not exists");

        stateQueryQueue[stateQueryQueueIDNow] = LibStructs.StateQueryRequest({ id: stateQueryQueueIDNow, checkpointID: checkpointID, slotID: slotID, timestamp: block.timestamp });

        emit DidQuerySlot(stateQueryQueueIDNow, checkpointID, slotID, stateQueryQueue[stateQueryQueueIDNow].timestamp);

        stateQueryQueueIDNow = stateQueryQueueIDNow.add(1);
    }

    /// @notice The operator responds back with a proof and contents of the slot.
    function responseQueryState (uint64 _queryID, bytes _proof, uint256 _amount, bytes _lock) {
        LibStructs.StateQueryRequest storage query = stateQueryQueue[_queryID];

        require(query.id != 0, "responseQueryState: State query request does not exists");

        LibCheckpointed.Checkpoint storage checkpoint = checkpoints[query.checkpointID];

        require(checkpoint.id != 0, "responseQueryState: Checkpoint does not exists");

//        prove(checkpoint, query.slotID, _amount, _lock, _proof);

        delete stateQueryQueue[_queryID];

        emit DidResponseQueryState(_queryID);
    }

    /// @notice If operator does not answer in timeout then make checkpoint invalid and halt.
    function finaliseQueryState (uint64 _queryID) {
        require(stateQueryQueue[_queryID].id != 0, "finaliseQueryState: State query request does not exists");

        uint256 stateQueryTimestamp = stateQueryQueue[_queryID].timestamp;

        require(block.timestamp > stateQueryTimestamp + stateQueryPeriod, "finaliseQueryState: State query settling period still proceed");

        halt = true;
    }

    function queryTransaction (bytes32 txid, uint256 checkpointId) {
//        txQuery += (id, checkpointId, txid, timeout)
    }

    function responseQueryTransaction(uint256 queryId, uint64[] ids, address txResolver, bytes unlock, bytes proof) {

    }

    function finaliseQueryTransaction(uint256 queryId) {

    }

    function queryChange (uint64 slotId, uint256 checkpointId) {

    }

    function responseQueryChange(uint256 queryId, bytes32 txid) {

    }

    function finaliseQueryChange(uint256 queryId) {

    }

    function invalidateInitialChecks (uint256 _checkpointId, bytes32 _prevHash, bytes _prevProof, bytes32 _curHash, bytes _curProof) private {
        require(checkpoints[_checkpointId].id != 0, "invalidate: Checkpoint does not exists");
        require(checkpoints[_checkpointId.sub(1)].id != 0, "invalidate: Previous checkpoint does not exists");

        require(LibService.isContained(checkpoints[_checkpointId].accountsStateSparseMerkleRoot, _curProof, _curHash), "invalidate: Provided cur slot does not exists in accounts states sparse tree merkle root");
        require(LibService.isContained(checkpoints[_checkpointId.sub(1)].accountsStateSparseMerkleRoot, _prevProof, _prevHash), "invalidate: Provided prev slot does not exists in accounts states sparse tree merkle root");
    }

    function transactionDigest(uint256 _txID, bytes32 _txType, address _lock, uint256 _amount) private view returns (bytes32) {
        if (_txType == "d") {
            require(deposits[_txID].id != 0, "invalidate: Tx does not exists in deposit queue");
            return depositDigest(_lock, _amount);
        } else if (_txType == "w") {
            require(withdrawalQueue[_txID].id != 0, "invalidate: Tx does not exists in withdrawal queue");
            return withdrawalDigest(_lock, _amount);
        }
    }

    function invalidate (uint256 _checkpointId, uint256 _txID, bytes _txProof, bytes32 _prevHash, bytes _prevProof, bytes32 _curHash, bytes _curProof, bytes1 _txType, address _lock, uint256 _amount, bytes _signature) {
        invalidateInitialChecks(_checkpointId, _prevHash, _prevProof, _curHash, _curProof);

        bytes32 txDigest = transactionDigest(_txID, _txType, _lock, _amount);

        require(LibService.isContained(checkpoints[_checkpointId].transactionsMerkleRoot, _txProof, txDigest) == false
                || LibService.isValidSignature(txDigest, _lock, _signature) == false, "invalidate: State is valid");

        checkpoints[_checkpointId].valid = false;

        halt = true;

        emit DidInvalidate(_checkpointId);
    }

    function startFastWithdrawal(bytes32 _slotHash, uint256 _amount) {
        fastWithdrawals[fastWithdrawalIDNow] = LibStructs.FastWithdrawal({ id: fastWithdrawalIDNow, slotHash: _slotHash, amount: _amount, timestamp: block.timestamp });

        emit DidStartFastWithdrawal(fastWithdrawalIDNow, _slotHash, _amount, fastWithdrawals[fastWithdrawalIDNow].timestamp);

        fastWithdrawalIDNow = fastWithdrawalIDNow.add(1);
    }

    function finishFastWithdrawal(uint256 fastWithdrawalID, bytes transaction, bytes32 currentSlot, bytes clientSignature) {
//        FastWithdrawal storage fastWithdrawal = fastWithdrawals[fastWithdrawalID];
//        uint256 fastWithdrawalTimestamp = fastWithdrawal.timestamp;
//        require(fastWithdrawal.id != 0, "Fast Withdrawal is not present");
//
//        newSlot = applyTransaction(currentSlot, transaction);
//        if (block.timestamp > fastWithdrawalTimestamp + fastWithdrawalPeriod) {
//            delete fastWithdrawals[fastWithdrawalID];
//            return;
//        }
//        require(newSlot == fastWithdrawal.slotHash, "Slot hash does not match");
//        //        unlockAddress = ecrecover(, fwI)
////        require(require(slot.canUnlock(unlockAddress)), "");
//        require(token.transfer(owner, fastWithdrawal.amount), "Can not transfer tokens to client");
//
//        emit DidFinaliseFastWithdrawal(fastWithdrawalID);
    }
}
