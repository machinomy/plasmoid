pragma solidity ^0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./assets/StandardTokenAsset.sol";
import "./DepositableLib.sol";

contract Depositable is StandardTokenAsset {
    using SafeMath for uint256;

    uint256 public currentDepositId;
    uint256 public settlingPeriod;

    mapping (uint256 => DepositableLib.Deposit) public deposits;

    event DidDeposit(uint256 indexed id, uint256 indexed amount, address lock, uint256 indexed timestamp);

    constructor (uint256 _settlingPeriod, address _token) public StandardTokenAsset(_token) {
        currentDepositId = 1;
        require(_settlingPeriod > 0, "Settling period must be > 0");
        settlingPeriod = _settlingPeriod;
    }

    /// @notice User deposits funds to the contract.
    /// @notice Add an entry to Deposits list, increase Deposit Counter.
    /// @notice Future: Use an asset manager to transfer the asset into the contract.
    /// @param _amount Amount of asset
    function deposit(uint256 _amount) public {
        require(_amount > 0, "CAN_NOT_DEPOSIT_ZERO");
        require(token.transferFrom(msg.sender, address(this), _amount), "CAN_NOT_TRANSFER");

        deposits[currentDepositId] = DepositableLib.Deposit({
            id: currentDepositId,
            amount: _amount,
            lock: msg.sender,
            timestamp: block.timestamp
        });

        emit DidDeposit(currentDepositId, _amount, msg.sender, block.timestamp);

        currentDepositId = currentDepositId.add(1);
    }
}
