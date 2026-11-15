// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice A test version of one asset (a stock, a coin, gold, a dollar stablecoin) for the phone app.
/// Test tokens only: the app prices them at real market prices, but they have no cash value.
///
/// Two addresses are special:
///   - `minter` (the Welcome contract) creates tokens for starter kits and the simulated Buy.
///   - `spender` (Osmo) can move a holder's tokens when the holder calls Osmo.sendToken,
///     so paying someone is one transaction with no approve step first. `allowance` reports it as
///     unlimited, so wallets and explorers can see why.
contract DemoAsset {
    string public name;
    string public symbol;
    uint8 public decimals;
    address public minter;
    address public spender;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) private _allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error NotMinter();
    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();
    error AlreadyInitialized();

    /// The implementation is locked; Welcome clones it (EIP-1167) per asset, which costs a fraction of a deploy.
    constructor() {
        minter = address(1);
    }

    function initialize(string calldata name_, string calldata symbol_, uint8 decimals_, address minter_, address spender_) external {
        if (minter != address(0)) revert AlreadyInitialized();
        if (minter_ == address(0) || spender_ == address(0)) revert ZeroAddress();
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        minter = minter_;
        spender = spender_;
    }

    function allowance(address owner, address who) public view returns (uint256) {
        return who == spender ? type(uint256).max : _allowance[owner][who];
    }

    function approve(address who, uint256 value) external returns (bool) {
        _allowance[msg.sender][who] = value;
        emit Approval(msg.sender, who, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (msg.sender != spender) {
            uint256 allowed = _allowance[from][msg.sender];
            if (allowed != type(uint256).max) {
                if (allowed < value) revert InsufficientAllowance();
                _allowance[from][msg.sender] = allowed - value;
            }
        }
        _move(from, to, value);
        return true;
    }

    function mint(address to, uint256 value) external {
        if (msg.sender != minter) revert NotMinter();
        if (to == address(0)) revert ZeroAddress();
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _move(address from, address to, uint256 value) private {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = balanceOf[from];
        if (bal < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = bal - value;
        }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
