pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";


contract Plasmoid {
    using SafeMath for uint256;

    mapping (uint256 => uint256) private balances;
    mapping (uint256 => address) public owners;

    uint256 public uid;

    StandardToken public token;

    event DidDeposit(address indexed owner, uint256 indexed uid, uint256 amount);
    event DidWithdraw(address indexed owner, uint256 indexed uid, uint256 amount);

    constructor (address _tokenAddress) public {
        token = StandardToken(_tokenAddress);
        uid = 0;
    }

    function balanceOf (uint256 _uid) public view returns (uint256) {
        return balances[_uid];
    }

    function deposit (uint256 amount) public {
        require(amount > 0, "Can not deposit 0");
        require(token.transferFrom(msg.sender, address(this), amount));
        uid = uid.add(1);
        balances[uid] = amount;
        owners[uid] = msg.sender;

        emit DidDeposit(msg.sender, uid, amount);
    }

    function withdraw (uint256 _uid) public {
        address owner = owners[_uid];
        uint256 amount = balances[_uid];

        require(amount > 0, "Balance is 0");
        require(owner == msg.sender, "Only owner can withdraw");
        require(token.transfer(owner, amount), "Can not transfer tokens");
        delete balances[_uid];
        delete owners[_uid];

        emit DidWithdraw(owner, uid, amount);
    }
}
