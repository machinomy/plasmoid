pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";


contract Plasmoid {
    using SafeMath for uint256;

    mapping (uint256 => uint256) private balances;
    mapping (uint256 => address) public owners;

    uint256 public uid;

    StandardToken public token;

    event DidDeposit(uint256 indexed uid, address indexed owner, uint256 amount);
    event DidWithdraw(uint256 indexed uid, address indexed owner, uint256 amount);
    event DidTransfer(uint256 indexed uid, address indexed owner, address indexed receiver);

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

    function transfer(uint256 _uid, address _receiver) public {
        address owner = owners[_uid];
        require(owner == msg.sender, "ONLY_OWNER_CAN_TRANSFER");
        owners[_uid] = _receiver;

        emit DidTransfer(_uid, owner, _receiver);
    }

    function transferDelegate (uint256 _uid, address _receiver, bytes _signature) public {
        bytes32 recoveryDigest = ECRecovery.toEthSignedMessageHash(transferDigest(_uid, _receiver));
        address recovered = ECRecovery.recover(recoveryDigest, _signature);
        address owner = owners[_uid];
        require(recovered == owner, "ONLY_OWNER_CAN_TRANSFER");
        owners[_uid] = _receiver;
        emit DidTransfer(_uid, owner, _receiver);
    }

    function transferDigest (uint256 _uid, address _receiver) public view returns (bytes32) {
        return keccak256(abi.encodePacked("t", address(this), _uid, _receiver));
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
