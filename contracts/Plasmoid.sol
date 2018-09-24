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

    uint256 public channelId;
    uint256 public checkpointId;

    StandardToken public token;

    event DidDeposit(uint256 indexed channelId, address indexed owner, uint256 amount);
    event DidWithdraw(uint256 indexed channelId, address indexed owner, uint256 amount);
    event DidWithdrawWithCheckpoint(uint256 indexed checkpointId, uint256 indexed channelId, address indexed owner, uint256 amount);
    event DidTransfer(uint256 indexed channelId, address indexed owner, address indexed receiver);
    event DidCheckpoint(uint256 indexed checkpointId);

    enum SignatureType {
        Caller, // 0x00
        EthSign // 0x01
    }

    struct Checkpoint {
        bytes32 merkleRoot;
        uint256 amount;
    }

    constructor (address _tokenAddress) public Ownable() {
        token = StandardToken(_tokenAddress);
        channelId = 0;
        checkpointId = 0;
    }

    function balanceOf (uint256 _channelId) public view returns (uint256) {
        return balances[_channelId];
    }

    function deposit (uint256 _amount) public {
        require(_amount > 0, "Can not deposit 0");
        require(token.transferFrom(msg.sender, address(this), _amount));
        channelId = channelId.add(1);
        balances[channelId] = _amount;
        owners[channelId] = msg.sender;

        emit DidDeposit(channelId, msg.sender, _amount);
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

    function withdraw (uint256 _uid) public {
        address owner = owners[_uid];
        uint256 amount = balances[_uid];

        require(amount > 0, "Balance is 0");
        require(owner == msg.sender, "Only owner can withdraw");
        require(token.transfer(owner, amount), "Can not transfer tokens");
        delete balances[_uid];
        delete owners[_uid];

        emit DidWithdraw(channelId, owner, amount);
    }

    function withdrawWithCheckpoint (uint256 _checkpointId, bytes _merkleProof, uint256 _channelId) public {
        address owner = owners[_channelId];
        uint256 checkpointAmount = checkpoints[_checkpointId].amount;
        bytes32 merkleRoot = checkpoints[_checkpointId].merkleRoot;
        uint256 channelAmount = balances[_channelId];
        bytes32 stateDigest = keccak256(abi.encodePacked(_channelId, channelAmount, owner));

        require(channelAmount > 0, "Balance is 0");
        require(owner == msg.sender, "Only owner can withdraw");
        require(checkpointAmount == channelAmount, "Checkpoint amount must be equal to channel amount");
        require(isContained(merkleRoot, _merkleProof, stateDigest), "State data is not in Merkle Root");
        require(token.transfer(owner, channelAmount), "Can not transfer tokens to owner");

        delete balances[_channelId];
        delete owners[_channelId];
        delete checkpoints[_checkpointId];

        emit DidWithdrawWithCheckpoint(_checkpointId, _channelId, owner, channelAmount);
    }

    function checkpoint (bytes32 _merkleRoot, uint256 amount, bytes _signature) public {
        require(isValidSignature(_merkleRoot, owner, _signature), "ONLY_OWNER_CAN_CHECKPOINT");
        checkpointId = checkpointId.add(1);
        checkpoints[checkpointId] = Checkpoint({ amount: amount, merkleRoot: _merkleRoot });

        emit DidCheckpoint(checkpointId);
    }

    function isContained(bytes32 merkleRoot, bytes _proof, bytes32 _datahash) public view returns (bool) {
        bytes32 proofElement;
        bytes32 cursor = _datahash;
        bool result = false;

            for (uint256 i = 32; i <= _proof.length; i += 32) {
                assembly { proofElement := mload(add(_proof, i)) } // solium-disable-line security/no-inline-assembly

                if (cursor < proofElement) {
                    cursor = keccak256(cursor, proofElement);
                } else {
                    cursor = keccak256(proofElement, cursor);
                }
            }
            result = cursor == merkleRoot;
        return result;
    }
}
