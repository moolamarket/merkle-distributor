// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";

contract AccumulatingMerkleDistributor is Ownable {
    uint public immutable timeout;
    address public immutable token;
    bytes32 public merkleRoot;

    // This is a packed array of booleans.
    mapping(address => uint256) public claimedAmount;

    event Claimed(uint256 index, address account, uint256 amount);
    event RootUpdated(bytes32 newRoot);

    constructor(address token_, bytes32 merkleRoot_, address owner_, uint timeout_) {
        transferOwnership(owner_);
        token = token_;
        merkleRoot = merkleRoot_;
        timeout = timeout_;
    }

    function claim(uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof) external {
        uint claimed = claimedAmount[account];
        require(claimed < amount, 'AccumulatingMerkleDistributor: Drop already claimed.');

        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(index, account, amount));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), 'AccumulatingMerkleDistributor: Invalid proof.');

        // Mark it claimed and send the token.
        claimedAmount[account] = amount;
        require(IERC20(token).transfer(account, amount - claimed), 'AccumulatingMerkleDistributor: Transfer failed.');

        emit Claimed(index, account, amount);
    }

    // New root should include all old recipients plus new ones.
    function updateRoot(bytes32 newRoot) public onlyOwner() {
        merkleRoot = newRoot;
        emit RootUpdated(newRoot);
    }

    function recover(address to, bytes calldata data) external onlyOwner() returns(bool, bytes memory) {
        if (to == token) {
            require(block.timestamp > timeout, 'AccumulatingMerkleDistributor: not timed out yet.');
        }
        return to.call(data);
    }
}

contract CELOAirdrop is AccumulatingMerkleDistributor(
    0x471EcE3750Da237f93B8E339c536989b8978a438,
    0x38eb355310c7f655bf4b7c4c91e8ad8b47003af41c9d3260743508317c0c95fb,
    0x3B0B4C9928c1412FBB69E2Bdd50D6b7b98398D96,
    1652400000) {} // Friday, 13 May 2022 00:00:00