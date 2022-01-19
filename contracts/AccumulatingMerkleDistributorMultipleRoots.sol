// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";

contract AccumulatingMerkleDistributorMultipleRoots is Ownable {
    uint public immutable timeout;
    address public immutable token;
    mapping(bytes32 => bool) public allowedMerkleRoots;

    // This is a packed array of booleans.
    mapping(address => uint256) public claimedAmount;

    event Claimed(uint256 index, address account, uint256 amount, bytes32 merkleRoot);
    event RootAdded(bytes32 newRoot);

    constructor(address _token, address _owner, uint _timeout) {
        transferOwnership(_owner);
        token = _token;
        timeout = _timeout;
    }

    function claim(uint256 _index, address _account, uint256 _amount, bytes32 _merkleRoot, bytes32[] calldata _merkleProof) external {
        require(allowedMerkleRoots[_merkleRoot], 'AccumulatingMerkleDistributorMultipleRoots: Invalid merkleRoot.');

        uint claimed = claimedAmount[_account];
        require(claimed < _amount, 'AccumulatingMerkleDistributorMultipleRoots: Drop already claimed.');

        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(_index, _account, _amount));
        require(MerkleProof.verify(_merkleProof, _merkleRoot, node), 'AccumulatingMerkleDistributorMultipleRoots: Invalid proof.');

        // Mark it claimed and send the token.
        claimedAmount[_account] = _amount;
        require(IERC20(token).transfer(_account, _amount - claimed), 'AccumulatingMerkleDistributorMultipleRoots: Transfer failed.');

        emit Claimed(_index, _account, _amount, _merkleRoot);
    }

    // New root should include all old recipients plus new ones.
    function addRoot(bytes32 _newRoot) public onlyOwner() {
        require(!allowedMerkleRoots[_newRoot], 'AccumulatingMerkleDistributorMultipleRoots: merkleRoot already exists.');
        allowedMerkleRoots[_newRoot] = true;
        emit RootAdded(_newRoot);
    }

    function recover(address _to, bytes calldata _data) external onlyOwner() returns(bool, bytes memory) {
        if (_to == token) {
            require(block.timestamp > timeout, 'AccumulatingMerkleDistributorMultipleRoots: not timed out yet.');
        }
        return _to.call(_data);
    }
}