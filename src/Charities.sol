// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The curated list of nonprofits people can give to in Osmo.
///
/// A curator checks each organization off chain (its EIN against the IRS Tax Exempt Organization Search) and lists
/// its wallet with `metaHash`, the keccak256 of the exact bytes of the JSON record that holds its legal name, EIN,
/// address and tax status. Anyone can hash the published record and compare, so the app can tell when a charity's
/// details changed after it was checked.
///
/// A gift is an ordinary Osmo send to the charity's username, and Osmo's `Sent` event is the record of it.
/// This contract never holds or moves money.
contract Charities {
    /// The curator: the only address that can list or revoke.
    address public owner;
    /// Every charity ever listed, oldest first. Append-only, so history stays readable after a revoke.
    address[] public list;
    mapping(address => bytes32) public metaHashOf;
    mapping(address => bool) public isVerified;

    event CharityAdded(address indexed charity, bytes32 metaHash);
    event CharityRevoked(address indexed charity);
    event OwnerChanged(address indexed owner);

    error NotOwner();
    error ZeroAddress();
    error ZeroHash();
    error AlreadyListed();
    error NotListed();
    error LengthMismatch();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// Hand curation to `next`.
    /// ponytail: single-step transfer; a two-step propose/accept is the upgrade if the curator key ever rotates.
    function setOwner(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        owner = next;
        emit OwnerChanged(next);
    }

    /// List `charity` as verified, pinned to the hash of its published record.
    function add(address charity, bytes32 metaHash) public onlyOwner {
        if (charity == address(0)) revert ZeroAddress();
        if (metaHash == bytes32(0)) revert ZeroHash();
        if (metaHashOf[charity] != bytes32(0)) revert AlreadyListed();
        list.push(charity);
        metaHashOf[charity] = metaHash;
        isVerified[charity] = true;
        emit CharityAdded(charity, metaHash);
    }

    /// `add` for several charities in one transaction.
    function addMany(address[] calldata charities, bytes32[] calldata metaHashes) external onlyOwner {
        if (charities.length != metaHashes.length) revert LengthMismatch();
        for (uint256 i; i < charities.length; ++i) {
            add(charities[i], metaHashes[i]);
        }
    }

    /// Stop showing `charity` as verified. It stays in `list` and keeps its hash, so old receipts still resolve.
    function revoke(address charity) external onlyOwner {
        if (metaHashOf[charity] == bytes32(0)) revert NotListed();
        isVerified[charity] = false;
        emit CharityRevoked(charity);
    }

    /// How many charities were ever listed.
    function count() external view returns (uint256) {
        return list.length;
    }
}
