pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "./LibBytes.sol";


contract Plasmoid {
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
        address owner;
        bytes32 hash;
    }

    constructor (address _tokenAddress) public {
        token = StandardToken(_tokenAddress);
        channelId = 0;
        checkpointId = 0;
    }

    function balanceOf (uint256 _uid) public view returns (uint256) {
        return balances[_uid];
    }

    function deposit (uint256 _amount) public {
        require(_amount > 0, "Can not deposit 0");
        require(token.transferFrom(msg.sender, address(this), _amount));
        channelId = channelId.add(1);
        balances[channelId] = _amount;
        owners[channelId] = msg.sender;

        emit DidDeposit(channelId, msg.sender, _amount);
    }

    function transfer (uint256 _uid, address _receiver, bytes _signature) public {
        address owner = owners[_uid];
        require(isValidSignature(transferDigest(_uid, _receiver), owner, _signature), "ONLY_OWNER_CAN_TRANSFER");
        owners[_uid] = _receiver;

        emit DidTransfer(_uid, owner, _receiver);
    }

    function transferDigest (uint256 _uid, address _receiver) public view returns (bytes32) {
        return keccak256(abi.encodePacked("t", address(this), _uid, _receiver));
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
        address owner = checkpoints[_checkpointId].owner;
        bytes32 checkpoint = checkpoints[_checkpointId].hash;

        uint256 amount = balances[_channelId];

        require(amount > 0, "Balance is 0");
        require(owner == msg.sender, "Only owner can withdraw");
        require(token.transfer(owner, amount), "Can not transfer tokens");
        require(isContained(checkpoint, _merkleProof, keccak256(_channelId, amount, owner)), "Payment data is not in Merkle Root");

        delete balances[_channelId];
        delete owners[_channelId];
        delete checkpoints[_checkpointId];

        emit DidWithdrawWithCheckpoint(_checkpointId, _channelId, owner, amount);
    }

    function checkpoint (bytes32 _hash, bytes _signature) public {
        address owner = owners[channelId];
        require(owner == msg.sender, "Only owner can checkpoint");
        require(isValidSignature(_hash, owner, _signature), "ONLY_OWNER_CAN_CHECKPOINT");
        checkpointId = checkpointId.add(1);
        checkpoints[checkpointId] = Checkpoint({owner: owner, hash: _hash});

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
