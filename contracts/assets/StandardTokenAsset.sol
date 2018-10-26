pragma solidity ^0.4.25;

import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";

contract StandardTokenAsset {
    StandardToken public token;

    constructor (address _token) {
        token = StandardToken(_token);
    }
}
