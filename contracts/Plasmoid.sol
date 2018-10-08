pragma solidity ^0.4.24;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "./LibBytes.sol";


contract Plasmoid {
    using SafeMath for uint256;
    using LibBytes for bytes;

    StandardToken public token;

    uint256 public settlingPeriod = 2 days;
    uint256 public withdrawalPeriod = 2 days;

    uint256 depositIDNow;
    uint256 lastCheckpointID;
    uint256 withdrawalQueueIDNow;

    enum SignatureType {
        Caller, // 0x00
        EthSign // 0x01
    }

    struct WithdrawalRequest {
        uint256 id;
        uint256 amount;
        address unlock;
        uint256 checkpointID;
    }

    struct DepositWithdrawalRequest {
        uint256 id;
        uint256 lastWithdrawalRequest;
        uint256 depositID;
    }

    struct Deposit {
        uint256 id;
        uint256 amount;
        address lock;
        uint256 timestamp;
    }

    struct Checkpoint {
        uint256 id;
        bytes32 transactionsMerkleRoot;
        bytes32 changesSparseMerkleRoot;
        bytes32 accountsStateSparseMerkleRoot;
        bool valid;
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

//    struct Transaction {
//        mapping (uint256 => bytes32) public assetTypes;
//    }

    mapping (uint256 => WithdrawalRequest) public withdrawalQueue;
    mapping (uint256 => DepositWithdrawalRequest) public depositWithdrawalQueue;
    mapping (uint256 => Deposit) public deposits;
    mapping (uint256 => Checkpoint) public checkpoints;
    mapping (address => bool) public trustedTransactionsList;

    event DidDeposit(uint256 id, uint256 amount, address lock, uint256 timestamp);

    bool halt = false;

    constructor (address _tokenAddress) public {
        token = StandardToken(_tokenAddress);
        depositIDNow = 1;
        lastCheckpointID = 0;
        withdrawalQueueIDNow = 1;
    }

    /// @notice User deposits funds to the contract.
    /// @notice Add an entry to Deposits list, increase Deposit Counter.
    /// @notice Future: Use an asset manager to transfer the asset into the contract.
    /// @param _amount Amount of asset
    /// @param _owner lock
    function deposit(uint256 _amount, address _owner) public {
        require(_amount > 0, "Can not deposit 0");
        require(token.transferFrom(msg.sender, address(this), _amount));
        deposits[depositIDNow] = Deposit({ id: depositIDNow, amount: _amount, lock: _owner, timestamp: block.timestamp });
        emit DidDeposit(depositIDNow, _amount, _owner, deposits[depositIDNow].timestamp);

        depositIDNow = depositIDNow.add(1);
    }

    /// @notice Initiate withdrawal from the contract.
    /// @notice Validate the slot is in the current checkpoint, add the request to a withdrawQueue.
    /// @param id id
    /// @param amount amount
    /// @param lock lock
    /// @param proof proof
    /// @param unlock unlock
    function startWithdraw (uint64 id, uint256 amount, bytes lock, bytes proof, bytes unlock) {
//        withdrawalQueue[withdrawalQueueIDNow] = new WithdrawalRequest(checkpoint, id, amount, lock, unlock, settlingPeriod);
        withdrawalQueueIDNow = withdrawalQueueIDNow.add(1);
    }

    /// @notice Remove withdrawal attempt if the checkpoint is invalid.
    /// @param withdrawalID Withdrawal ID
    function challengeWithdraw (uint256 withdrawalID) {
        WithdrawalRequest storage withdrawalRequest = withdrawalQueue[withdrawalID];
//        require(withdrawalRequest block.timestamp);
    }

    /// @notice If the withdrawal has not been challenged during a withdrawal window, one could freely exit the contract.
    /// @param withdrawalID Withdrawal ID
    function finishWithdraw (uint256 withdrawalID) {
        WithdrawalRequest memory withdrawalRequest = withdrawalQueue[withdrawalID];
        uint256 checkpointID = withdrawalRequest.checkpointID;
        Checkpoint checkpoint = checkpoints[checkpointID];
        uint256 amount = withdrawalRequest.amount;
        require(checkpoint.valid == true, "Checkpoint is not valid");
//        require(token.transfer(owner, amount), "Can not transfer tokens to owner");
    }

    /// @notice Initiate withdrawal from the deposit that has not been included in to a checkpoint.
    /// @param depositID depositID
    /// @param unlock unlock
    function depositWithdraw (uint256 depositID, bytes unlock) {

    }

    /// @notice Challenge the withdrawal request by showing that the deposit is included into the current checkpoint.

    function challengeDepositWithdraw (uint256 depositWithdrawalID, bytes proof) {
        DepositWithdrawalRequest storage depositWithdrawalRequest = depositWithdrawalQueue[depositWithdrawalID];
//        WithdrawalRequest withdrawalRequest = depositWithdrawalRequest.depositID
//        prove(deposit.amount, deposit.assetType.lock, deposit.unlock, checkpoint, proof)
    }

    /// @notice If the withdraw attempt has not been challenged during timeout, process with the withdrawal.
    function finaliseDepositWithdraw (uint256 depositWithdrawalID) {

    }

    /// @notice Ask the operator for contents of the slot in the checkpoint.

    function querySlot (uint64 slotID, uint256 checkpointID) {

    }

    /// @notice The operator responds back with a proof and contents of the slot.
    function responseQueryState (uint256 queryID, bytes proof, uint256 amount, bytes lock) {

    }

    /// @notice If operator does not answer in timeout then make checkpoint invalid and halt.
    function finaliseQueryState (uint64 id) {

    }

    function queryTransaction (bytes32 txid, uint256 checkpointId) {

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

    function startFastWithdrawal(bytes32 slotHash, uint256 amount) {

    }

    function finishFastWithdraw(uint256 fwId, bytes transaction, bytes32 currentSlot, bytes clientSignature) {

    }

    function isValidSignature (bytes32 _hash, address _signatory, bytes memory _signature) public view returns (bool) {
        uint8 signatureTypeRaw = uint8(_signature.popLastByte());
        SignatureType signatureType = SignatureType(signatureTypeRaw);
        if (signatureType == SignatureType.Caller) {
            return msg.sender == _signatory;
        } else if (signatureType == SignatureType.EthSign) {
            address recovered = ECRecovery.recover(ECRecovery.toEthSignedMessageHash(_hash), _signature);
            return recovered == _signatory;
        } else {
            revert("SIGNATURE_UNSUPPORTED");
        }
    }

    function isContained(bytes32 merkleRoot, bytes _proof, bytes32 _datahash) public pure returns (bool) {
        bytes32 proofElement;
        bytes32 cursor = _datahash;
        bool result = false;

            for (uint256 i = 32; i <= _proof.length; i += 32) {
                assembly { proofElement := mload(add(_proof, i)) } // solium-disable-line security/no-inline-assembly

                if (cursor < proofElement) {
                    cursor = keccak256(abi.encodePacked(cursor, proofElement));
                } else {
                    cursor = keccak256(abi.encodePacked(proofElement, cursor));
                }
            }
            result = cursor == merkleRoot;
        return result;
    }
}
