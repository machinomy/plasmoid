pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";


contract Plasmoid {
    using SafeMath for uint256;

    mapping (address => uint256) private balances;
    StandardToken public token;

    constructor (address _tokenAddress) public {
        token = StandardToken(_tokenAddress);
    }

    function balanceOf (address owner) public view returns (uint256) {
        return balances[owner];
    }

    function deposit (uint256 amount) public {
        token.transferFrom(msg.sender, address(this), amount);
        balances[msg.sender] = balances[msg.sender].add(amount);
    }

    function withdraw () public {
        require(balances[msg.sender] > 0, "Balance is 0");
        token.transfer(msg.sender, balances[msg.sender]);
    }
}
