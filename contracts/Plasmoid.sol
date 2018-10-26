pragma solidity ^0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./DepositWithdraw.sol";
import "./LibBytes.sol";
import "./LibStructs.sol";
import "./LibService.sol";
import "./CheckpointedLib.sol";
import "./Depositable.sol";
import "./Queryable.sol";

contract Plasmoid is Ownable, DepositWithdraw, Queryable {
    using SafeMath for uint64;
    using SafeMath for uint256;
    using LibBytes for bytes;

    uint256 public withdrawalPeriod;
    uint256 public fastWithdrawalPeriod;

    uint256 public withdrawalQueueIDNow;
    uint256 public fastWithdrawalIDNow;

    mapping (uint256 => LibStructs.WithdrawalRequest) public withdrawalQueue;
    mapping (uint256 => LibStructs.FastWithdrawal) public fastWithdrawals;
    mapping (uint256 => LibStructs.Transaction) public transactions;
    mapping (address => bool) public trustedTransactionsList;

    event DidMakeCheckpoint(uint256 id);
    event DidStartFastWithdrawal(uint256 id, bytes32 slotHash, uint256 amount, uint256 timestamp);
    event DidFinaliseFastWithdrawal(uint256 id);
    event DidStartWithdrawal(uint256 id, uint256 checkpointID, uint256 amount, address lock, bytes unlock, uint256 timestamp);
    event DidFinaliseWithdrawal(uint256 id);
    event DidInvalidate(uint256 checkpointID);

    constructor (address _token, uint256 _settlingPeriod, uint256 _depositWithdrawalPeriod, uint256 _withdrawalPeriod, uint256 _stateQueryPeriod) public Ownable() DepositWithdraw(_depositWithdrawalPeriod, _token) {
        withdrawalQueueIDNow = 1;
        stateQueryQueueIDNow = 1;
        fastWithdrawalIDNow = 1;

        require(_withdrawalPeriod > 0, "Withdrawal period must be > 0");
        require(_stateQueryPeriod > 0, "State query period must be > 0");

        settlingPeriod = _settlingPeriod;
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
        checkpoints[currentCheckpointId] = CheckpointedLib.Checkpoint({
            id: currentCheckpointId,
            transactionsMerkleRoot: _transactionsMerkleRoot,
            changesSparseMerkleRoot: _changesSparseMerkleRoot,
            accountsStateSparseMerkleRoot: _accountsStateSparseMerkleRoot,
            valid: true
        });

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
        CheckpointedLib.Checkpoint storage checkpoint = checkpoints[checkpointID];

        require(checkpoint.id != 0, "finaliseWithdrawal: Checkpoint does not exists");
        require(checkpoint.valid == true, "finaliseWithdrawal: Checkpoint is not valid");

        uint256 amount = withdrawalRequest.amount;
        address owner = withdrawalRequest.lock;

        require(token.transfer(owner, amount), "finaliseWithdrawal: Can not transfer tokens to owner");

        emit DidFinaliseWithdrawal(withdrawalID);
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
