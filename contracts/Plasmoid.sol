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

    uint256 public uid;

    StandardToken public token;

    event DidDeposit(uint256 indexed uid, address indexed owner, uint256 amount);
    event DidWithdraw(uint256 indexed uid, address indexed owner, uint256 amount);
    event DidTransfer(uint256 indexed uid, address indexed owner, address indexed receiver);

    enum SignatureType {
        Caller, // 0x00
        EthSign, // 0x01
        MAX
    }

    constructor (address _tokenAddress) public {
        token = StandardToken(_tokenAddress);
        uid = 0;
    }

    function balanceOf (uint256 _uid) public view returns (uint256) {
        return balances[_uid];
    }

    function deposit (uint256 _amount) public {
        require(_amount > 0, "Can not deposit 0");
        require(token.transferFrom(msg.sender, address(this), _amount));
        uid = uid.add(1);
        balances[uid] = _amount;
        owners[uid] = msg.sender;

        emit DidDeposit(uid, msg.sender, _amount);
    }

    function transfer(uint256 _uid, address _receiver, bytes _signature) public {
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
        require(signatureTypeRaw < uint8(SignatureType.MAX), "SIGNATURE_UNSUPPORTED");
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

        emit DidWithdraw(uid, owner, amount);
    }
}
