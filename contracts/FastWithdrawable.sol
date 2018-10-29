pragma solidity ^0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./FastWithdrawalLib.sol";
import "./LibBytes.sol";

contract FastWithdrawable {
    using SafeMath for uint64;
    using SafeMath for uint256;
    using LibBytes for bytes;

    uint256 public fastWithdrawalPeriod;
    uint256 public fastWithdrawalIDNow;

    mapping (uint256 => FastWithdrawalLib.FastWithdrawal) public fastWithdrawals;

    event DidStartFastWithdrawal(uint256 id, bytes32 slotHash, uint256 amount, uint256 timestamp);

    constructor (uint256 _fastWithdrawalPeriod) public {
        require(_fastWithdrawalPeriod > 0, "Fast withdrawal period must be > 0");
        fastWithdrawalPeriod = _fastWithdrawalPeriod;
    }

    function startFastWithdrawal(bytes32 _slotHash, uint256 _amount) {
        fastWithdrawals[fastWithdrawalIDNow] = FastWithdrawalLib.FastWithdrawal({ id: fastWithdrawalIDNow, slotHash: _slotHash, amount: _amount, timestamp: block.timestamp });

        emit DidStartFastWithdrawal(fastWithdrawalIDNow, _slotHash, _amount, fastWithdrawals[fastWithdrawalIDNow].timestamp);

        fastWithdrawalIDNow = fastWithdrawalIDNow.add(1);
    }

    function finishFastWithdrawal(uint256 fastWithdrawalID, bytes transaction, bytes32 currentSlot, bytes clientSignature) {
        //        FastWithdrawal storage fastWithdrawal = fastWithdrawals[fastWithdrawalID];
        //        uint256 fastWithdrawalTimestamp = fastWithdrawal.timestamp;
        //        require(fastWithdrawal.id != 0, "Fast Withdrawal is not present");
        //
        //        newSlot = applyTransaction(currentSlot, transaction);
        //        if (block.timestamp > fastWithdrawalTimestamp + fastWithdrawalPeriod) {
        //            delete fastWithdrawals[fastWithdrawalID];
        //            return;
        //        }
        //        require(newSlot == fastWithdrawal.slotHash, "Slot hash does not match");
        //        //        unlockAddress = ecrecover(, fwI)
        ////        require(require(slot.canUnlock(unlockAddress)), "");
        //        require(token.transfer(owner, fastWithdrawal.amount), "Can not transfer tokens to client");
        //
        //        emit DidFinaliseFastWithdrawal(fastWithdrawalID);
    }
}
