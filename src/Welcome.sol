// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {DemoAsset} from "./DemoAsset.sol";

/// @notice Gets a new phone ready to pay in one transaction, so nobody sees a wallet, a faucet or a gas prompt.
///
/// The app makes a wallet on the phone, then its server calls `welcome(user)`: the wallet gets a starter kit
/// of demo assets and a little MON for its own gas. The wallet then claims its username in UsernameRegistry
/// and pays through Osmo itself, so every payment is signed by the person making it.
///
/// It also lists the demo assets (one DemoAsset per stock or coin) and mints for the app's simulated Buy.
contract Welcome {
    struct Grant {
        DemoAsset token;
        uint96 amount;
    }

    enum Status {
        Open,
        Paid,
        Declined,
        Cancelled
    }

    /// "Pay me $22 for ramen". Nothing moves until the payer pays through Osmo.
    struct Request {
        address from;
        address payer;
        uint64 usdCents;
        Status status;
        string note;
    }

    address public owner;
    mapping(address => bool) public isOperator;
    /// Osmo, the only contract allowed to move demo assets without an approval.
    address public immutable osmo;
    /// Every demo asset is a clone of this.
    address public immutable assetImpl;
    Request[] public requests;

    DemoAsset[] public assets;
    mapping(string => DemoAsset) public assetBySymbol;
    mapping(address => bool) public isAsset;

    Grant[] private _kit;
    mapping(address => bool) public welcomed;
    /// MON topped up on welcome so the wallet can pay its own gas.
    uint256 public gasGrant;

    /// Everyone who joined, oldest first, so the app can list people without scanning logs
    /// (Monad's public RPC answers eth_getLogs for 100 blocks at a time).
    address[] public members;
    /// Display profile: "Display name|picture id|country code". Shown in the app, never verified.
    mapping(address => string) public profileOf;
    uint256 public constant MAX_PROFILE_BYTES = 120;
    /// Hard ceiling on members. Every welcome spends MON from the float and grows the list, and the server route
    /// that calls it is open to anyone, so a flood of fresh addresses must stop here, on chain, not in the server.
    /// The owner may raise it.
    uint256 public maxMembers = 500;

    event AssetListed(string symbol, address token);
    event Welcomed(address indexed user, uint256 gas);
    event Granted(address indexed user, address indexed token, uint256 amount);
    event ProfileSet(address indexed user, string profile);
    event Requested(uint256 indexed id, address indexed from, address indexed payer, uint256 usdCents, string note);
    event RequestClosed(uint256 indexed id, Status status);

    error NotOwner();
    error NotOperator();
    error UnknownAsset();
    error SymbolTaken();
    error LengthMismatch();
    error TransferFailed();
    error ProfileTooLong();
    error NotMember();
    error NotYours();
    error NotOpen();
    error RoomFull();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert NotOperator();
        _;
    }

    constructor(address osmo_, uint256 gasGrant_) {
        owner = msg.sender;
        isOperator[msg.sender] = true;
        osmo = osmo_;
        gasGrant = gasGrant_;
        assetImpl = address(new DemoAsset());
    }

    /// MON for the gas float.
    receive() external payable {}

    /// Starter kit, gas and profile, once per wallet. Safe to call twice: the second call does nothing.
    function welcome(address user, string calldata profile) external onlyOperator {
        if (welcomed[user]) return;
        if (members.length >= maxMembers) revert RoomFull();
        welcomed[user] = true;
        members.push(user);
        _setProfile(user, profile);
        uint256 n = _kit.length;
        for (uint256 i; i < n; ++i) {
            Grant memory g = _kit[i];
            g.token.mint(user, g.amount);
            emit Granted(user, address(g.token), g.amount);
        }
        uint256 gas;
        if (user.balance < gasGrant) {
            gas = gasGrant - user.balance;
            if (address(this).balance < gas) gas = address(this).balance;
            if (gas > 0) {
                (bool ok,) = user.call{value: gas}("");
                if (!ok) revert TransferFailed();
            }
        }
        emit Welcomed(user, gas);
    }

    /// Change your own name, picture or flag.
    function setProfile(string calldata profile) external {
        if (!welcomed[msg.sender]) revert NotMember();
        _setProfile(msg.sender, profile);
    }

    // --- requests ---

    function request(address payer, uint64 usdCents, string calldata note) external returns (uint256 id) {
        if (!welcomed[msg.sender] || payer == msg.sender || payer == address(0)) revert NotMember();
        if (bytes(note).length > MAX_PROFILE_BYTES) revert ProfileTooLong();
        id = requests.length;
        requests.push(Request(msg.sender, payer, usdCents, Status.Open, note));
        emit Requested(id, msg.sender, payer, usdCents, note);
    }

    /// The payer marks it Paid (after paying through Osmo) or Declined; the requester can Cancel.
    function closeRequest(uint256 id, Status status) external {
        Request storage r = requests[id];
        if (r.status != Status.Open || status == Status.Open) revert NotOpen();
        bool payer = msg.sender == r.payer && (status == Status.Paid || status == Status.Declined);
        bool asker = msg.sender == r.from && status == Status.Cancelled;
        if (!payer && !asker) revert NotYours();
        r.status = status;
        emit RequestClosed(id, status);
    }

    function requestCount() external view returns (uint256) {
        return requests.length;
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    function _setProfile(address user, string calldata profile) private {
        if (bytes(profile).length > MAX_PROFILE_BYTES) revert ProfileTooLong();
        profileOf[user] = profile;
        emit ProfileSet(user, profile);
    }

    /// The simulated "Buy" and "Add money" in the app: demo tokens, no real money.
    function grant(address user, DemoAsset token, uint256 amount) external onlyOperator {
        if (!isAsset[address(token)]) revert UnknownAsset();
        token.mint(user, amount);
        emit Granted(user, address(token), amount);
    }

    function listAsset(string calldata name, string calldata symbol, uint8 decimals)
        external
        onlyOwner
        returns (DemoAsset token)
    {
        if (address(assetBySymbol[symbol]) != address(0)) revert SymbolTaken();
        token = DemoAsset(Clones.clone(assetImpl));
        token.initialize(name, symbol, decimals, address(this), osmo);
        assets.push(token);
        assetBySymbol[symbol] = token;
        isAsset[address(token)] = true;
        emit AssetListed(symbol, address(token));
    }

    function setKit(DemoAsset[] calldata tokens, uint96[] calldata amounts) external onlyOwner {
        if (tokens.length != amounts.length) revert LengthMismatch();
        delete _kit;
        for (uint256 i; i < tokens.length; ++i) {
            if (!isAsset[address(tokens[i])]) revert UnknownAsset();
            _kit.push(Grant(tokens[i], amounts[i]));
        }
    }

    function kit() external view returns (Grant[] memory) {
        return _kit;
    }

    function assetCount() external view returns (uint256) {
        return assets.length;
    }

    function setOperator(address who, bool on) external onlyOwner {
        isOperator[who] = on;
    }

    function setGasGrant(uint256 amount) external onlyOwner {
        gasGrant = amount;
    }

    function setMaxMembers(uint256 n) external onlyOwner {
        maxMembers = n;
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
