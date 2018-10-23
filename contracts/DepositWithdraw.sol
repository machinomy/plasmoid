pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./Checkpoint.sol";
import "./LibBytes.sol";
import "./LibStructs.sol";
import "./LibService.sol";
import "./assets/StandardTokenAsset.sol";


contract DepositWithdraw is Checkpoint, StandardTokenAsset {
    using SafeMath for uint256;
    using LibBytes for bytes;

    uint256 public depositWithdrawalPeriod;

    uint256 public depositWithdrawalQueueIDNow;
    uint256 public depositIDNow;

    mapping (uint256 => LibStructs.Deposit) public deposits;
    mapping (uint256 => LibStructs.DepositWithdrawalRequest) public depositWithdrawalQueue;

    event DidDepositWithdraw(uint256 id, uint256 depositID, bytes unlock, address owner, uint256 checkpointID);
    event DidChallengeDepositWithdraw(uint256 id);
    event DidFinaliseDepositWithdraw(uint256 id);

    constructor () {
    }

    function depositDigest (uint256 _depositID, uint256 _amount) public view returns (bytes32) {
        return keccak256(abi.encodePacked("d", _depositID, _amount));
    }

    /// @notice Initiate withdrawal from the deposit that has not been included in to a checkpoint.
    /// @param _depositID depositID
    /// @param _unlock Signature of depositDigest (uint256 _depositID, uint256 _amount)
    function depositWithdraw (uint256 _depositID, bytes _unlock) public {
        require(deposits[_depositID].id != 0, "Deposit does not exists");

        LibStructs.Deposit storage depo = deposits[_depositID];
        bytes32 depositWithdrawHash = depositDigest(depo.id, depo.amount);

        require(LibService.isValidSignature(depositWithdrawHash, msg.sender, _unlock), "depositWithdraw: Signature is not valid");

        depositWithdrawalQueue[depositWithdrawalQueueIDNow] = LibStructs.DepositWithdrawalRequest({    id: depositWithdrawalQueueIDNow,
            depositID: _depositID,
            unlock: _unlock,
            owner: msg.sender,
            checkpointID: checkpointIDNow.sub(1) });

        emit DidDepositWithdraw(depositWithdrawalQueueIDNow, _depositID, _unlock, msg.sender, checkpointIDNow.sub(1));

        depositWithdrawalQueueIDNow = depositWithdrawalQueueIDNow.add(1);
    }

    /// @notice Challenge the withdrawal request by showing that the deposit is included into the current checkpoint.
    function challengeDepositWithdraw (uint256 _depositWithdrawalID, bytes _proofTransactions, bytes _proofChanges, bytes _proofAccounts) public {
        LibStructs.DepositWithdrawalRequest storage depositWithdrawalRequest = depositWithdrawalQueue[_depositWithdrawalID];

        require(depositWithdrawalRequest.id != 0, "DepositWithdrawalRequest does not exists");

        uint256 depositID = depositWithdrawalRequest.id;
        LibStructs.Deposit storage _deposit = deposits[depositID];
        uint256 depositWithdrawalTimestamp = _deposit.timestamp;
        LibStructs.Checkpoint storage checkpoint = checkpoints[checkpointIDNow.sub(1)];

        require(checkpoint.id != 0, "Checkpoint does not exists");
        require(block.timestamp <= depositWithdrawalTimestamp + depositWithdrawalPeriod, "Deposit withdrawal settling period is exceeded");
        require(depositWithdrawProve(_deposit.id,
            _deposit.amount,
            _deposit.lock,
            depositWithdrawalRequest.unlock,
            checkpoint.transactionsMerkleRoot,
            checkpoint.changesSparseMerkleRoot,
            checkpoint.accountsStateSparseMerkleRoot,
            _proofTransactions,
            _proofChanges,
            _proofAccounts), "Deposit withdraw is not in checkpoint");

        delete depositWithdrawalQueue[_depositWithdrawalID];

        emit DidChallengeDepositWithdraw(_depositWithdrawalID);
    }

    /// @notice If the withdraw attempt has not been challenged during timeout, process with the withdrawal.
    function finaliseDepositWithdraw (uint256 depositWithdrawalID) public {
        require(depositWithdrawalQueue[depositWithdrawalID].id != 0, "Deposit withdrawal request is not present");

        uint256 depositID = depositWithdrawalQueue[depositWithdrawalID].id;
        uint256 depositWithdrawalTimestamp = deposits[depositID].timestamp;
        address owner = depositWithdrawalQueue[depositWithdrawalID].owner;
        uint256 amount = deposits[depositID].amount;

        require(block.timestamp > depositWithdrawalTimestamp + depositWithdrawalPeriod, "Deposit withdrawal settling period still proceed");
        require(token.transfer(owner, amount), "Can not transfer tokens to owner");

        delete depositWithdrawalQueue[depositWithdrawalID];

        emit DidFinaliseDepositWithdraw(depositWithdrawalID);
    }

    function depositWithdrawProve ( uint256 _depositID,
        uint256 _amount,
        address _lock,
        bytes _unlock,
        bytes32 _checkpointTransactionsMerkleRoot,
        bytes32 _checkpointChangesSparseMerkleRoot,
        bytes32 _checkpointAccountsStateSparseMerkleRoot,
        bytes _proofTransactions,
        bytes _proofChanges,
        bytes _proofAccounts) public returns (bool) {

        require(deposits[_depositID].id != 0, "Deposit does not exists");

        bytes32 digest = depositDigest(_depositID, _amount);
        //        if (LibService.isValidSignature(digest, _lock, _unlock)) {
        //            return true;
        //        }

        return true;

    }
}
