pragma solidity ^0.4.24;

import "zeppelin-solidity/contracts/math/SafeMath.sol";


contract Plasmoid {
    using SafeMath for uint256;

    mapping (address => uint256) private balances;

    function balanceOf(address owner) public view returns (uint256) {
        return balances[owner];
    }
}
