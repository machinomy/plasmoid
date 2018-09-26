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
    mapping (uint256 => bytes32) public checkpoints;
    mapping (bytes32 => ExitQueueElement) public exitQueue;

    uint256 public channelIdNow;
    uint256 public checkpointIdNow;

    StandardToken public token;

    uint256 public settlingPeriod = 3 days;

    event DidDeposit(uint256 indexed channelId, address indexed owner, uint256 amount);
    event DidWithdraw(uint256 indexed channelId, address indexed owner, uint256 amount);
    event DidStartWithdraw(uint256 indexed checkpointId, uint256 indexed channelId, address indexed owner, uint256 amount);
    event DidTransfer(uint256 indexed channelId, address indexed owner, address indexed receiver);
    event DidCheckpoint(uint256 indexed checkpointId);
    event DidFinalizeWithdraw(bytes32 indexed withdrawalRequestID);
    event DidAddToExitingQueue(uint256 indexed channelId, uint256 indexed channelAmount, address indexed owner, uint256 checkpointId, uint256 withdrawalRequestMoment, bytes32 withdrawalRequestID);

    struct ExitQueueElement {
        uint256 channelId;
        uint256 channelAmount;
        address owner;
        uint256 checkpointId;
        uint256 withdrawalRequestMoment;
    }

    enum SignatureType {
        Caller, // 0x00
        EthSign // 0x01
    }

    constructor (address _tokenAddress) public Ownable() {
        token = StandardToken(_tokenAddress);
        channelIdNow = 0;
        checkpointIdNow = 0;
    }

    function balanceOf (uint256 _channelId) public view returns (uint256) {
        return balances[_channelId];
    }

    function setSettlingPeriod (uint256 _settlingPeriod) {
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

    function checkpoint (bytes32 _merkleRoot, bytes _signature) public {
        require(isValidSignature(_merkleRoot, owner, _signature), "ONLY_OWNER_CAN_CHECKPOINT");
        checkpointIdNow = checkpointIdNow.add(1);
        checkpoints[checkpointIdNow] = _merkleRoot;

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
        bytes32 merkleRoot = checkpoints[_checkpointId];
        uint256 channelAmount = balances[_channelId];
        bytes32 stateDigest = keccak256(abi.encodePacked(_channelId, channelAmount, owner));

        require(channelAmount > 0, "Balance is 0");
        require(owner == msg.sender, "Only owner can withdraw");
        require(isContained(merkleRoot, _merkleProof, stateDigest), "State data is not in Merkle Root");
        addToExitingQueue(owner, channelAmount, _channelId, _checkpointId);

        emit DidStartWithdraw(_checkpointId, _channelId, owner, channelAmount);
    }

    function addToExitingQueue (address _owner, uint256 _channelAmount, uint256 _channelId, uint256 _checkpointId) public {
        bytes32 _stateDigest = keccak256(abi.encodePacked(_channelId, _channelAmount, _owner));
        exitQueue[_stateDigest] = ExitQueueElement({ channelId: _channelId, channelAmount: _channelAmount, owner: _owner, checkpointId: _checkpointId, withdrawalRequestMoment: block.timestamp });
        emit DidAddToExitingQueue(_channelId, _channelAmount, _owner, _checkpointId, exitQueue[_stateDigest].withdrawalRequestMoment, _stateDigest);
    }

    function finalizeWithdraw (bytes32 _withdrawalRequestID) public {
        uint256 _withdrawalRequestMoment = exitQueue[_withdrawalRequestID].withdrawalRequestMoment;
        uint256 _channelId = exitQueue[_withdrawalRequestID].channelId;
        uint256 _checkpointId = exitQueue[_withdrawalRequestID].checkpointId;
        uint256 _channelAmount = exitQueue[_withdrawalRequestID].channelAmount;
        address _owner = exitQueue[_withdrawalRequestID].owner;
        if (_withdrawalRequestMoment + settlingPeriod < block.timestamp) {
            require(token.transfer(_owner, _channelAmount), "Can not transfer tokens to owner");

            delete balances[_channelId];
            delete owners[_channelId];
            delete checkpoints[_checkpointId];
            delete exitQueue[_withdrawalRequestID];

            emit DidFinalizeWithdraw(_withdrawalRequestID);
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
