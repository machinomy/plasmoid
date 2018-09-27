pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./LibBytes.sol";


contract Plasmoid is Ownable {
    using SafeMath for uint256;
    using LibBytes for bytes;

    mapping (uint256 => uint256) private balances;
    mapping (uint256 => address) public owners;
    mapping (uint256 => Checkpoint) public checkpoints;
    mapping (bytes32 => ExitQueueElement) public exitQueue;
    mapping (bytes32 => DisputeQueueElement) public disputeQueue;

    uint256 public channelIdNow;
    uint256 public checkpointIdNow;

    StandardToken public token;

    uint256 public settlingPeriod = 3 days;

    bool halt = false;

    event DidDeposit(uint256 indexed channelId, address indexed owner, uint256 amount);
    event DidWithdraw(uint256 indexed channelId, address indexed owner, uint256 amount);
    event DidStartWithdraw(uint256 checkpointId, uint256 channelId, uint256 amount, address owner);
    event DidTransfer(uint256 indexed channelId, address indexed owner, address indexed receiver);
    event DidCheckpoint(uint256 indexed checkpointId);
    event DidFinalizeWithdraw(bytes32 indexed withdrawalRequestID);
    event DidAddToExitingQueue(uint256 indexed channelId, uint256 indexed channelAmount, address indexed owner, uint256 checkpointId, uint256 withdrawalRequestMoment, bytes32 withdrawalRequestID);
    event DidStartDispute(uint256 checkpointId, uint256 channelId, uint256 amount, address owner);
    event DidAddToDisputeQueue(uint256 indexed channelId, uint256 indexed channelAmount, address indexed owner, uint256 checkpointId, uint256 disputeRequestMoment, bytes32 disputeRequestID);
    event DidFinalizeDispute(bytes32 disputeRequestID);

    struct Checkpoint {
        bytes32 stateMerkleRoot;
        bytes32 acceptanceMerkleRoot;
        bytes32 ownersMerkleRoot;
    }

    struct ExitQueueElement {
        uint256 channelId;
        uint256 channelAmount;
        address owner;
        uint256 checkpointId;
        uint256 withdrawalRequestMoment;
    }

    struct DisputeQueueElement {
        uint256 channelId;
        uint256 channelAmount;
        address owner;
        uint256 checkpointId;
        uint256 disputeRequestMoment;
    }

    enum SignatureType {
        Caller, // 0x00
        EthSign // 0x01
    }

    constructor (address _tokenAddress) public Ownable() {
        token = StandardToken(_tokenAddress);
        channelIdNow = 1;
        checkpointIdNow = 1;
    }

    function balanceOf (uint256 _channelId) public view returns (uint256) {
        return balances[_channelId];
    }

    function setSettlingPeriod (uint256 _settlingPeriod) public {
        require(_settlingPeriod > 0, "Settling period must be > 0");
        settlingPeriod = _settlingPeriod;
    }

    function deposit (uint256 _amount) public {
        require(_amount > 0, "Can not deposit 0");
        require(token.transferFrom(msg.sender, address(this), _amount));
        channelIdNow = channelIdNow.add(1);
        balances[channelIdNow] = _amount;
        owners[channelIdNow] = msg.sender;

        emit DidDeposit(channelIdNow, msg.sender, _amount);
    }

    function transfer (uint256 _channelId, address _receiver, bytes _signature) public {
        address owner = owners[_channelId];
        require(isValidSignature(transferDigest(_channelId, _receiver), owner, _signature), "ONLY_OWNER_CAN_TRANSFER");
        owners[_channelId] = _receiver;

        emit DidTransfer(_channelId, owner, _receiver);
    }

    function transferDigest (uint256 _channelId, address _receiver) public view returns (bytes32) {
        return keccak256(abi.encodePacked("t", address(this), _channelId, _receiver));
    }

    function acceptCurrentStateDigest (uint256 _channelId, uint256 _amount, address _owner) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("acceptCurrentState", _channelId, _amount, _owner));
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

    function checkpoint (bytes32 _stateMerkleRoot, bytes32 _acceptanceMerkleRoot, bytes32 _ownersMerkleRoot, bytes _stateSignature, bytes _acceptanceSignature, bytes _ownersSignature) public {
        require(!halt, 'Halt state. This contract instance can not make checkpoints anymore.');
        require(isValidSignature(_stateMerkleRoot, owner, _stateSignature), "ONLY_PLASMOID_OWNER_CAN_CHECKPOINT");
        require(isValidSignature(_acceptanceMerkleRoot, owner, _acceptanceSignature), "ONLY_PLASMOID_OWNER_CAN_CHECKPOINT");
        require(isValidSignature(_ownersMerkleRoot, owner, _ownersSignature), "ONLY_PLASMOID_OWNER_CAN_CHECKPOINT");
        checkpointIdNow = checkpointIdNow.add(1);
        checkpoints[checkpointIdNow] = Checkpoint({ stateMerkleRoot: _stateMerkleRoot, acceptanceMerkleRoot: _acceptanceMerkleRoot, ownersMerkleRoot: _ownersMerkleRoot });

        emit DidCheckpoint(checkpointIdNow);
    }

    function withdraw (uint256 _uid) public {
        address owner = owners[_uid];
        uint256 amount = balances[_uid];

        require(amount > 0, "Balance is 0");
        require(owner == msg.sender, "Only owner can withdraw");
        require(token.transfer(owner, amount), "Can not transfer tokens");
        delete balances[_uid];
        delete owners[_uid];

        emit DidWithdraw(_uid, owner, amount);
    }

    function startWithdraw (uint256 _checkpointId, bytes _merkleProof, uint256 _channelId) public {
        address owner = owners[_channelId];
        bytes32 merkleRoot = checkpoints[_checkpointId].stateMerkleRoot;
        uint256 channelAmount = balances[_channelId];
        bytes32 stateDigest = keccak256(abi.encodePacked(_channelId, channelAmount, owner));

        require(channelAmount > 0, "Balance is 0");
        require(owner == msg.sender, "Only owner can withdraw");
        require(isContained(merkleRoot, _merkleProof, stateDigest), "State data is not in Merkle Root");
        addToExitingQueue(owner, channelAmount, _channelId, _checkpointId);

        emit DidStartWithdraw(_checkpointId, _channelId, channelAmount, owner);
    }

    function addToExitingQueue (address _owner, uint256 _channelAmount, uint256 _channelId, uint256 _checkpointId) internal {
        uint256 timestamp = block.timestamp;
        bytes32 _stateDigest = keccak256(abi.encodePacked(_channelId, _channelAmount, _owner, timestamp));
        exitQueue[_stateDigest] = ExitQueueElement({ channelId: _channelId, channelAmount: _channelAmount, owner: _owner, checkpointId: _checkpointId, withdrawalRequestMoment: timestamp });
        emit DidAddToExitingQueue(_channelId, _channelAmount, _owner, _checkpointId, timestamp, _stateDigest);
    }

    function finalizeWithdraw (bytes32 _withdrawalRequestID) public {
        uint256 _withdrawalRequestMoment = exitQueue[_withdrawalRequestID].withdrawalRequestMoment;
        uint256 _channelId = exitQueue[_withdrawalRequestID].channelId;
        uint256 _checkpointId = exitQueue[_withdrawalRequestID].checkpointId;
        uint256 _channelAmount = exitQueue[_withdrawalRequestID].channelAmount;
        address _owner = exitQueue[_withdrawalRequestID].owner;
        require(_withdrawalRequestMoment + settlingPeriod < block.timestamp);
        require(token.transfer(_owner, _channelAmount), "Can not transfer tokens to owner");

        delete balances[_channelId];
        delete owners[_channelId];
        delete checkpoints[_checkpointId];
        delete exitQueue[_withdrawalRequestID];

        emit DidFinalizeWithdraw(_withdrawalRequestID);
    }

    // Called by user
    function startDispute (uint256 _channelId, uint256 _amount, address _owner, bytes _signature, uint256 _checkpointId, bytes _ownersMerkleProof) public {
        // need to keccak all params here!
        bytes32 inputHash = keccak256(abi.encodePacked(_channelId, _amount, _owner));
        require(isValidSignature(inputHash, _owner, _signature), "ONLY_OWNER_CAN_DISPUTE");
        bytes32 ownersMerkleRoot = checkpoints[_checkpointId].ownersMerkleRoot;
        require(isContained(ownersMerkleRoot, _ownersMerkleProof, keccak256(abi.encodePacked(_owner))), "Owner is not in owners merkle root");
        addToDisputeQueue(_owner, _amount, _channelId, _checkpointId);

        emit DidStartDispute(_checkpointId, _channelId, _amount, _owner);
    }

    function addToDisputeQueue (address _owner, uint256 _channelAmount, uint256 _channelId, uint256 _checkpointId) internal {
        uint256 timestamp = block.timestamp;
        bytes32 _stateDigest = keccak256(abi.encodePacked(_channelId, _channelAmount, _owner, timestamp));
        disputeQueue[_stateDigest] = DisputeQueueElement({ channelId: _channelId, channelAmount: _channelAmount, owner: _owner, checkpointId: _checkpointId, disputeRequestMoment: timestamp });

        emit DidAddToDisputeQueue(_channelId, _channelAmount, _owner, _checkpointId, timestamp, _stateDigest);
    }

    function answerDispute (bytes32 _disputeRequestID, bytes _acceptanceMerkleProof) public {
        uint256 channelId = disputeQueue[_disputeRequestID].channelId;
        uint256 channelAmount = disputeQueue[_disputeRequestID].channelAmount;
        address owner = disputeQueue[_disputeRequestID].owner;
        uint256 checkpointId = disputeQueue[_disputeRequestID].checkpointId;

        bytes32 acceptanceHash = acceptCurrentStateDigest(channelId, channelAmount, owner);
        bytes32 acceptanceMerkleRoot = checkpoints[checkpointId].acceptanceMerkleRoot;

        require(isContained(acceptanceMerkleRoot, _acceptanceMerkleProof, acceptanceHash), "Acceptance hash is not in merkle root");

        delete disputeQueue[_disputeRequestID];
    }

    function finalizeDispute (bytes32 _disputeRequestID) public {
        require(disputeQueue[_disputeRequestID].owner != 0, 'Dispute element does not exists');
        uint256 _disputeRequestMoment = disputeQueue[_disputeRequestID].disputeRequestMoment;
        require(_disputeRequestMoment + settlingPeriod < block.timestamp);
        halt = true;

        emit DidFinalizeDispute(_disputeRequestID);
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
