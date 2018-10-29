pragma solidity ^0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./LibBytes.sol";
import "./LibStructs.sol";
import "./Haltable.sol";
import "./CheckpointedLib.sol";
import "./Checkpointed.sol";

contract Queryable is Haltable, Checkpointed {
    using SafeMath for uint256;
    using LibBytes for bytes;

    uint256 public stateQueryPeriod;
    uint256 public stateQueryQueueIDNow;

    mapping (uint256 => LibStructs.StateQueryRequest) public stateQueryQueue;

    event DidQuerySlot(uint256 id, uint256 checkpointID, uint256 slotID, uint256 timestamp);
    event DidResponseQueryState(uint64 id);

    constructor (uint256 _stateQueryPeriod) public {
        require(_stateQueryPeriod > 0, "State query period must be > 0");

        stateQueryQueueIDNow = 1;
        stateQueryPeriod = _stateQueryPeriod;
    }

    /// @notice Ask the operator for contents of the slot in the checkpoint.
    function querySlot (uint256 checkpointID, uint64 slotID) {
        require(checkpoints[checkpointID].id != 0, "querySlot: Checkpoint does not exists");

        stateQueryQueue[stateQueryQueueIDNow] = LibStructs.StateQueryRequest({ id: stateQueryQueueIDNow, checkpointID: checkpointID, slotID: slotID, timestamp: block.timestamp });

        emit DidQuerySlot(stateQueryQueueIDNow, checkpointID, slotID, stateQueryQueue[stateQueryQueueIDNow].timestamp);

        stateQueryQueueIDNow = stateQueryQueueIDNow.add(1);
    }

    /// @notice The operator responds back with a proof and contents of the slot.
    function responseQueryState (uint64 _queryID, bytes _proof, uint256 _amount, bytes _lock) {
        LibStructs.StateQueryRequest storage query = stateQueryQueue[_queryID];

        require(query.id != 0, "responseQueryState: State query request does not exists");

        CheckpointedLib.Checkpoint storage checkpoint = checkpoints[query.checkpointID];

        require(checkpoint.id != 0, "responseQueryState: Checkpoint does not exists");

        //        prove(checkpoint, query.slotID, _amount, _lock, _proof);

        delete stateQueryQueue[_queryID];

        emit DidResponseQueryState(_queryID);
    }

    /// @notice If operator does not answer in timeout then make checkpoint invalid and halt.
    function finaliseQueryState (uint64 _queryID) {
        require(stateQueryQueue[_queryID].id != 0, "finaliseQueryState: State query request does not exists");

        uint256 stateQueryTimestamp = stateQueryQueue[_queryID].timestamp;

        require(block.timestamp > stateQueryTimestamp + stateQueryPeriod, "finaliseQueryState: State query settling period still proceed");

        halt = true;
    }

    function queryTransaction (bytes32 txid, uint256 checkpointId) {
        //        txQuery += (id, checkpointId, txid, timeout)
    }

    function responseQueryTransaction(uint256 queryId, uint64[] ids, address txResolver, bytes unlock, bytes proof) {

    }

    function finaliseQueryTransaction(uint256 queryId) {

    }

    function queryChange (uint64 slotId, uint256 checkpointId) {

    }

    function responseQueryChange(uint256 queryId, bytes32 txid) {

    }

    function finaliseQueryChange(uint256 queryId) {

    }
}
