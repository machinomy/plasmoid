pragma solidity ^0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./assets/StandardTokenAsset.sol";
import "./LibService.sol";
import "./CheckpointedLib.sol";
import "./Checkpointed.sol";
import "./WithdrawableLib.sol";

contract Withdrawable is StandardTokenAsset, Checkpointed {
    using SafeMath for uint256;

    uint256 public withdrawalPeriod;
    uint256 public currentWithdrawalId;

    mapping (uint256 => WithdrawableLib.WithdrawalRequest) public withdrawalQueue;

    event DidStartWithdrawal(uint256 id, uint256 checkpointID, uint256 amount, address lock, bytes unlock, uint256 timestamp);
    event DidFinaliseWithdrawal(uint256 id);

    constructor (uint256 _withdrawalPeriod, address _token) StandardTokenAsset(_token) {
        require(_withdrawalPeriod > 0, "Withdrawal period must be > 0");

        withdrawalPeriod = _withdrawalPeriod;
        currentWithdrawalId = 1;
    }

    /// @notice Initiate withdrawal from the contract.
    /// @notice Validate the slot is in the current checkpoint, add the request to a withdrawQueue.
    /// @param _checkpointID checkpointID
    /// @param _amount amount
    /// @param _lock lock
    /// @param _proof proof
    /// @param _unlock unlock
    function startWithdrawal (uint256 _checkpointID, uint64 _slotID, uint256 _amount, address _lock, bytes _proof, bytes _unlock) public {
        bytes32 hash = keccak256(abi.encodePacked("w", _lock, _amount));

        require(checkpoints[_checkpointID].id != 0, "startWithdrawal: Checkpoint does not exists");
        require(LibService.isValidSignature(hash, _lock, _unlock), "startWithdrawal: Signature is not valid");

        withdrawalQueue[currentWithdrawalId] = WithdrawableLib.WithdrawalRequest({ id: currentWithdrawalId, checkpointID: _checkpointID, amount: _amount, lock: _lock, timestamp: block.timestamp });

        emit DidStartWithdrawal(currentWithdrawalId, _checkpointID, _amount, _lock, _unlock, withdrawalQueue[currentWithdrawalId].timestamp);

        currentWithdrawalId = currentWithdrawalId.add(1);
    }

    /// @notice Remove withdrawal attempt if the checkpoint is invalid.
    /// @param withdrawalID Withdrawal ID
    function revokeWithdrawal (uint256 withdrawalID) public {
        WithdrawableLib.WithdrawalRequest storage withdrawalRequest = withdrawalQueue[withdrawalID];
        //        require(withdrawalRequest block.timestamp);
    }

    /// @notice If the withdrawal has not been challenged during a withdrawal window, one could freely exit the contract.
    /// @param withdrawalID Withdrawal ID
    function finaliseWithdrawal (uint256 withdrawalID) public {
        WithdrawableLib.WithdrawalRequest memory withdrawalRequest = withdrawalQueue[withdrawalID];

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
}
