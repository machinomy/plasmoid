pragma solidity ^0.4.25;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/ECRecovery.sol";
import "./LibBytes.sol";
import "./LibStructs.sol";

library LibService {
    using SafeMath for uint256;
    using LibBytes for bytes;

    function isContained (bytes32 merkleRoot, bytes _proof, bytes32 _datahash) public pure returns (bool) {
        bytes32 proofElement;
        bytes32 cursor = _datahash;
        bool result = false;

        for (uint256 i = 32; i <= _proof.length; i += 32) {
            assembly { proofElement := mload(add(_proof, i)) } // solium-disable-line security/no-inline-assembly

            if (cursor < proofElement) {
                cursor = keccak256(abi.encodePacked(cursor, proofElement));
            } else {
                cursor = keccak256(abi.encodePacked(proofElement, cursor));
            }
        }
        result = cursor == merkleRoot;
        return result;
    }

    function isValidSignature (bytes32 _hash, address _signatory, bytes memory _signature) public view returns (bool) {
        uint8 signatureTypeRaw = uint8(_signature.popLastByte());
        LibStructs.SignatureType signatureType = LibStructs.SignatureType(signatureTypeRaw);
        if (signatureType == LibStructs.SignatureType.Caller) {
            return msg.sender == _signatory;
        } else if (signatureType == LibStructs.SignatureType.EthSign) {
            address recovered = ECRecovery.recover(ECRecovery.toEthSignedMessageHash(_hash), _signature);
            return recovered == _signatory;
        } else {
            revert("SIGNATURE_UNSUPPORTED");
        }
    }
}
