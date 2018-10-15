pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./LibBytes.sol";


contract Plasmoid is Ownable {
    using SafeMath for uint256;
    using LibBytes for bytes;

    StandardToken public token;

    uint256 public settlingPeriod = 2 days;
    uint256 public depositWithdrawalPeriod = 2 days;
    uint256 public withdrawalPeriod = 2 days;
    uint256 public stateQueryPeriod = 2 days;
    uint256 public fastWithdrawalPeriod = 2 days;

    uint256 public depositIDNow;
    uint256 public checkpointIDNow;
    uint256 public withdrawalQueueIDNow;
    uint256 public depositWithdrawalQueueIDNow;
    uint256 public stateQueryQueueIDNow;
    uint256 public fastWithdrawalIDNow;

    enum SignatureType {
        Caller, // 0x00
        EthSign // 0x01
    }

    struct Deposit {
        uint256 id;
        uint256 amount;
        address lock;
        uint256 timestamp;
    }

    struct WithdrawalRequest {
        uint256 id;
        uint256 checkpointID;
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

//    struct Transaction {
//        mapping (uint256 => bytes32) public assetTypes;
//    }

    mapping (uint256 => WithdrawalRequest) public withdrawalQueue;
    mapping (uint256 => DepositWithdrawalRequest) public depositWithdrawalQueue;
    mapping (uint256 => Deposit) public deposits;
    mapping (uint256 => Checkpoint) public checkpoints;
    mapping (address => bool) public trustedTransactionsList;
    mapping (uint256 => StateQueryRequest) public stateQueryQueue;
    mapping (uint256 => FastWithdrawal) public fastWithdrawals;
    mapping (uint256 => Transaction) public transactions;

    event DidDeposit(uint256 id, uint256 amount, address lock, uint256 timestamp);
    event DidDepositWithdraw(uint256 id, uint256 depositID, bytes unlock, address owner, uint256 checkpointID);
    event DidChallengeDepositWithdraw(uint256 id);
    event DidFinaliseDepositWithdraw(uint256 id);
    event DidQuerySlot(uint256 id, uint256 checkpointID, uint256 slotID, uint256 timestamp);
    event DidResponseQueryState(uint64 id);
    event DidMakeCheckpoint(uint256 id);
    event DidStartFastWithdrawal(uint256 id, bytes32 slotHash, uint256 amount, uint256 timestamp);
    event DidFinaliseFastWithdrawal(uint256 id);
    event DidStartWithdrawal(uint256 id, uint256 checkpointID, uint256 amount, address lock, bytes unlock, uint256 timestamp);
    event DidFinaliseWithdrawal(uint256 id);

    bool halt = false;

    constructor (address _tokenAddress) public Ownable() {
        token = StandardToken(_tokenAddress);
        depositIDNow = 1;
        checkpointIDNow = 1;
        withdrawalQueueIDNow = 1;
        depositWithdrawalQueueIDNow = 1;
        stateQueryQueueIDNow = 1;
        fastWithdrawalIDNow = 1;
    }

    function depositDigest (uint256 _depositID, uint256 _amount) public view returns (bytes32) {
        return keccak256(abi.encodePacked("dd", _depositID, _amount));
    }

    function depositTransactionDigest (uint256 _amount, address _destination) public view returns (bytes32) {
        return keccak256(abi.encodePacked("01", _amount, _destination));
    }

    function withdrawalDigest (uint64 _slotID, uint256 _amount) public view returns (bytes32) {
        return keccak256(abi.encodePacked("w", _slotID, _amount));
    }

    function accountsDigest (uint256 _amount, address _owner) public view returns (bytes32) {
        return keccak256(abi.encodePacked(_amount, _owner));
    }

    function setSettlingPeriod (uint256 _settlingPeriod) public {
        require(_settlingPeriod > 0, "Settling period must be > 0");
        settlingPeriod = _settlingPeriod;
    }

    function setDepositWithdrawalPeriod (uint256 _depositWithdrawalPeriod) public {
        require(_depositWithdrawalPeriod > 0, "Deposit withdrawal period must be > 0");
        depositWithdrawalPeriod = _depositWithdrawalPeriod;
    }

    function setWithdrawalPeriod (uint256 _withdrawalPeriod) public {
        require(_withdrawalPeriod > 0, "Withdrawal period must be > 0");
        withdrawalPeriod = _withdrawalPeriod;
    }

    function setStateQueryPeriod (uint256 _stateQueryPeriod) public {
        require(_stateQueryPeriod > 0, "State query period must be > 0");
        stateQueryPeriod = _stateQueryPeriod;
    }

    function makeCheckpoint (bytes32 _transactionsMerkleRoot, bytes32 _changesSparseMerkleRoot, bytes32 _accountsStateSparseMerkleRoot, bytes signature) public {
        bytes32 hash = keccak256(abi.encodePacked(_transactionsMerkleRoot, _changesSparseMerkleRoot, _accountsStateSparseMerkleRoot));
        require(isValidSignature(hash, owner, signature), "Signature is not valid");
        checkpoints[checkpointIDNow] = Checkpoint({ id: checkpointIDNow,
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

        deposits[depositIDNow] = Deposit({ id: depositIDNow, amount: _amount, lock: msg.sender, timestamp: block.timestamp });

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
        bytes32 hash = keccak256(abi.encodePacked("w", _slotID, _amount));
        require(isValidSignature(hash, _lock, _unlock), "Signature is not valid");
        withdrawalQueue[withdrawalQueueIDNow] = WithdrawalRequest({ id: withdrawalQueueIDNow, checkpointID: _checkpointID, amount: _amount, lock: _lock, timestamp: block.timestamp });

        emit DidStartWithdrawal(withdrawalQueueIDNow, _checkpointID, _amount, _lock, _unlock, withdrawalQueue[withdrawalQueueIDNow].timestamp);

        withdrawalQueueIDNow = withdrawalQueueIDNow.add(1);
    }

    /// @notice Remove withdrawal attempt if the checkpoint is invalid.
    /// @param withdrawalID Withdrawal ID
    function revokeWithdrawal (uint256 withdrawalID) {
        WithdrawalRequest storage withdrawalRequest = withdrawalQueue[withdrawalID];
//        require(withdrawalRequest block.timestamp);
    }

    /// @notice If the withdrawal has not been challenged during a withdrawal window, one could freely exit the contract.
    /// @param withdrawalID Withdrawal ID
    function finaliseWithdrawal (uint256 withdrawalID) {
        WithdrawalRequest memory withdrawalRequest = withdrawalQueue[withdrawalID];
        require(withdrawalRequest.id != 0, "Withdrawal request is not exists");
        uint256 checkpointID = withdrawalRequest.checkpointID;
        Checkpoint storage checkpoint = checkpoints[checkpointID];
        uint256 amount = withdrawalRequest.amount;
        address owner = withdrawalRequest.lock;
        require(checkpoint.valid == true, "Checkpoint is not valid");
        require(token.transfer(owner, amount), "Can not transfer tokens to owner");

        emit DidFinaliseWithdrawal(withdrawalID);
    }

    /// @notice Initiate withdrawal from the deposit that has not been included in to a checkpoint.
    /// @param _depositID depositID
    /// @param _unlock Signature of depositDigest (uint256 _depositID, uint256 _amount)
    function depositWithdraw (uint256 _depositID, uint256 _checkpointID, bytes _unlock) public {
        Deposit storage depo = deposits[_depositID];
        bytes32 depositWithdrawHash = depositDigest(depo.id, depo.amount);

        require(isValidSignature(depositWithdrawHash, msg.sender, _unlock), "Signature is not valid");

        depositWithdrawalQueue[depositWithdrawalQueueIDNow] = DepositWithdrawalRequest({    id: depositWithdrawalQueueIDNow,
                                                                                            depositID: _depositID,
                                                                                            unlock: _unlock,
                                                                                            owner: msg.sender,
                                                                                            checkpointID: _checkpointID });

        emit DidDepositWithdraw(depositWithdrawalQueueIDNow, _depositID, _unlock, msg.sender, _checkpointID);

        depositWithdrawalQueueIDNow = depositWithdrawalQueueIDNow.add(1);
    }

    /// @notice Challenge the withdrawal request by showing that the deposit is included into the current checkpoint.
    function challengeDepositWithdraw (uint256 _depositWithdrawalID, uint256 checkpointID, bytes _proofTransactions, bytes _proofChanges, bytes _proofAccounts) public {
        DepositWithdrawalRequest storage depositWithdrawalRequest = depositWithdrawalQueue[_depositWithdrawalID];
        uint256 depositID = depositWithdrawalRequest.depositID;
        Deposit storage _deposit = deposits[depositID];
        uint256 depositWithdrawalTimestamp = _deposit.timestamp;
        Checkpoint storage checkpoint = checkpoints[checkpointID];

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
        uint256 depositID = depositWithdrawalQueue[depositWithdrawalID].depositID;
        uint256 depositWithdrawalTimestamp = deposits[depositID].timestamp;
        address owner = depositWithdrawalQueue[depositWithdrawalID].owner;
        uint256 amount = deposits[depositID].amount;

        require(depositWithdrawalQueue[depositWithdrawalID].id != 0, "Deposit withdrawal request is not present");
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
                                    bytes _proofAccounts) public returns (bool){
        bytes32 digest = depositDigest(_depositID, _amount);
//        if (isValidSignature(digest, _lock, _unlock)) {
//            return true;
//        }

        return true;

    }

    /// @notice Ask the operator for contents of the slot in the checkpoint.
    function querySlot (uint256 checkpointID, uint64 slotID) {
        stateQueryQueue[stateQueryQueueIDNow] = StateQueryRequest({ id: stateQueryQueueIDNow, checkpointID: checkpointID, slotID: slotID, timestamp: block.timestamp });

        emit DidQuerySlot(stateQueryQueueIDNow, checkpointID, slotID, stateQueryQueue[stateQueryQueueIDNow].timestamp);

        stateQueryQueueIDNow = stateQueryQueueIDNow.add(1);
    }

    /// @notice The operator responds back with a proof and contents of the slot.
    function responseQueryState (uint64 _queryID, bytes _proof, uint256 _amount, bytes _lock) {
        StateQueryRequest storage query = stateQueryQueue[_queryID];
        Checkpoint storage checkpoint = checkpoints[query.checkpointID];

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
        fastWithdrawals[fastWithdrawalIDNow] = FastWithdrawal({ id: fastWithdrawalIDNow, slotHash: _slotHash, amount: _amount, timestamp: block.timestamp });

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
