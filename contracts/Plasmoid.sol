pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./DepositWithdraw.sol";
import "./LibBytes.sol";
import "./LibStructs.sol";
import "./LibService.sol";

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

//    struct Transaction {
//        mapping (uint256 => bytes32) public assetTypes;
//    }

    mapping (uint256 => LibStructs.WithdrawalRequest) public withdrawalQueue;
    mapping (uint256 => LibStructs.StateQueryRequest) public stateQueryQueue;
    mapping (uint256 => LibStructs.FastWithdrawal) public fastWithdrawals;
    mapping (uint256 => LibStructs.Transaction) public transactions;
    mapping (address => bool) public trustedTransactionsList;

    event DidDeposit(uint256 id, uint256 amount, address lock, uint256 timestamp);
    event DidQuerySlot(uint256 id, uint256 checkpointID, uint256 slotID, uint256 timestamp);
    event DidResponseQueryState(uint64 id);
    event DidMakeCheckpoint(uint256 id);
    event DidStartFastWithdrawal(uint256 id, bytes32 slotHash, uint256 amount, uint256 timestamp);
    event DidFinaliseFastWithdrawal(uint256 id);
    event DidStartWithdrawal(uint256 id, uint256 checkpointID, uint256 amount, address lock, bytes unlock, uint256 timestamp);
    event DidFinaliseWithdrawal(uint256 id);

    bool halt = false;

    constructor (address _tokenAddress, uint256 _settlingPeriod, uint256 _depositWithdrawalPeriod, uint256 _withdrawalPeriod, uint256 _stateQueryPeriod) public Ownable() {
        token = StandardToken(_tokenAddress);
        depositIDNow = 1;
        checkpointIDNow = 1;
        withdrawalQueueIDNow = 1;
        depositWithdrawalQueueIDNow = 1;
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

    function depositTransactionDigest (uint256 _amount, address _destination) public view returns (bytes32) {
        return keccak256(abi.encodePacked("d", _amount, _destination));
    }

    function withdrawalDigest (uint64 _slotID, uint256 _amount) public view returns (bytes32) {
        return keccak256(abi.encodePacked("w", _slotID, _amount));
    }

    function accountsDigest (uint256 _amount, address _owner) public view returns (bytes32) {
        return keccak256(abi.encodePacked(_amount, _owner));
    }

    function makeCheckpoint (bytes32 _transactionsMerkleRoot, bytes32 _changesSparseMerkleRoot, bytes32 _accountsStateSparseMerkleRoot, bytes signature) public {
        bytes32 hash = keccak256(abi.encodePacked(_transactionsMerkleRoot, _changesSparseMerkleRoot, _accountsStateSparseMerkleRoot));
        require(LibService.isValidSignature(hash, this.owner(), signature), "makeCheckpoint: Signature is not valid");
        checkpoints[checkpointIDNow] = LibStructs.Checkpoint({ id: checkpointIDNow,
                                                    transactionsMerkleRoot: _transactionsMerkleRoot,
                                                    changesSparseMerkleRoot: _changesSparseMerkleRoot,
                                                    accountsStateSparseMerkleRoot: _accountsStateSparseMerkleRoot,
                                                    valid: true });
        emit DidMakeCheckpoint(checkpointIDNow);
    }

    /// @notice User deposits funds to the contract.
    /// @notice Add an entry to Deposits list, increase Deposit Counter.
    /// @notice Future: Use an asset manager to transfer the asset into the contract.
    /// @param _amount Amount of asset
    function deposit(uint256 _amount) public {
        require(_amount > 0, "Can not deposit 0");
        require(token.transferFrom(msg.sender, address(this), _amount), "Can not transfer");

        deposits[depositIDNow] = LibStructs.Deposit({ id: depositIDNow, amount: _amount, lock: msg.sender, timestamp: block.timestamp });

        emit DidDeposit(depositIDNow, _amount, msg.sender, deposits[depositIDNow].timestamp);

        depositIDNow = depositIDNow.add(1);
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
        require(withdrawalRequest.id != 0, "finaliseWithdrawal: Withdrawal request is not exists");
        uint256 checkpointID = withdrawalRequest.checkpointID;
        LibStructs.Checkpoint storage checkpoint = checkpoints[checkpointID];
        uint256 amount = withdrawalRequest.amount;
        address owner = withdrawalRequest.lock;
        require(checkpoint.valid == true, "finaliseWithdrawal: Checkpoint is not valid");
        require(token.transfer(owner, amount), "finaliseWithdrawal: Can not transfer tokens to owner");

        emit DidFinaliseWithdrawal(withdrawalID);
    }

    /// @notice Ask the operator for contents of the slot in the checkpoint.
    function querySlot (uint256 checkpointID, uint64 slotID) {
        stateQueryQueue[stateQueryQueueIDNow] = LibStructs.StateQueryRequest({ id: stateQueryQueueIDNow, checkpointID: checkpointID, slotID: slotID, timestamp: block.timestamp });

        emit DidQuerySlot(stateQueryQueueIDNow, checkpointID, slotID, stateQueryQueue[stateQueryQueueIDNow].timestamp);

        stateQueryQueueIDNow = stateQueryQueueIDNow.add(1);
    }

    /// @notice The operator responds back with a proof and contents of the slot.
    function responseQueryState (uint64 _queryID, bytes _proof, uint256 _amount, bytes _lock) {
        LibStructs.StateQueryRequest storage query = stateQueryQueue[_queryID];
        LibStructs.Checkpoint storage checkpoint = checkpoints[query.checkpointID];

//        prove(checkpoint, query.slotID, _amount, _lock, _proof);

        delete stateQueryQueue[_queryID];

        emit DidResponseQueryState(_queryID);
    }

    /// @notice If operator does not answer in timeout then make checkpoint invalid and halt.
    function finaliseQueryState (uint64 _queryID) {
        require(stateQueryQueue[_queryID].id != 0, "State query request does not exists");

        uint256 stateQueryTimestamp = stateQueryQueue[_queryID].timestamp;

        require(block.timestamp > stateQueryTimestamp + stateQueryPeriod, "State query settling period still proceed");

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

    function invalidate (uint256 checkpointId, bytes32 txId, bytes txProof, uint256 prevSlot, bytes prevProof, uint256 curSlot, bytes curProof ) {

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
