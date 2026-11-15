// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {DemoAsset} from "../src/DemoAsset.sol";
import {Osmo} from "../src/Osmo.sol";
import {UsernameRegistry} from "../src/UsernameRegistry.sol";
import {Welcome} from "../src/Welcome.sol";

/// Deploys the whole set to whichever chain --rpc-url names, then writes every
/// address to deployments/<network>.json. The phone app reads its addresses
/// and ABIs from that file (`npm run contracts` in web/), so one deploy moves
/// everything to the new contracts.
///
///   RELAYER=<app server wallet> script/with-deployer.sh forge script script/Deploy.s.sol:Deploy \
///     --account monad-deployer --broadcast --rpc-url monad_testnet
///   cd web && npm run contracts
///
/// Env: RELAYER (the app server's wallet, allowed to welcome and grant; optional),
/// GAS_GRANT (wei of MON per new wallet, default 0.1), FLOAT (wei sent to Welcome
/// for gas grants, default 1 MON).
///
/// Do not use `msg.sender` here. In a forge script it is the simulation
/// sender, not the wallet that signs the broadcast, so anything minted to
/// it lands at an address nobody holds a key for. The demo accounts below
/// are named outright for that reason, and the deployer is read back from
/// Welcome.owner(), which the broadcast set.
contract Deploy is Script {
    /// Throwaway testnet accounts the demo client sends as. Their keys live in
    /// demo/demo-keys.js, which is gitignored.
    address constant ALICE = 0x9eD68aFD9aF46Aea351B78D491068Ca23aEe5dB5;
    address constant BOB = 0xa76e8E1193b48e483224eb311ea4Fc14158eDEAF;

    struct A {
        string name;
        string symbol;
        uint8 decimals;
    }

    function run() external {
        address relayer = vm.envOr("RELAYER", address(0));
        uint256 gasGrant = vm.envOr("GAS_GRANT", uint256(0.1 ether));
        uint256 float_ = vm.envOr("FLOAT", uint256(1 ether));
        uint256 deployBlock = block.number;

        vm.startBroadcast();

        UsernameRegistry usernames = new UsernameRegistry();
        Osmo osmo = new Osmo(usernames);
        Welcome welcome = new Welcome(address(osmo), gasGrant);

        A[23] memory list = _assets();
        for (uint256 i; i < list.length; ++i) {
            welcome.listAsset(list[i].name, list[i].symbol, list[i].decimals);
        }

        // Starter kit, about $150 at Nov 15 prices, so every demo wallet has plenty to send around:
        // $50 USDC, $40 NVIDIA, $25 Tesla, $20 Bitcoin, $15 gold.
        DemoAsset[] memory kit = new DemoAsset[](5);
        uint96[] memory amt = new uint96[](5);
        kit[0] = welcome.assetBySymbol("USDC");
        amt[0] = 50e6;
        kit[1] = welcome.assetBySymbol("NVDA");
        amt[1] = 0.2437e18;
        kit[2] = welcome.assetBySymbol("TSLA");
        amt[2] = 0.0643e18;
        kit[3] = welcome.assetBySymbol("BTC");
        amt[3] = 0.000309e18;
        kit[4] = welcome.assetBySymbol("PAXG");
        amt[4] = 0.003905e18;
        welcome.setKit(kit, amt);

        // The demo client's share is test NVIDIA, the same token the app uses.
        DemoAsset share = welcome.assetBySymbol("NVDA");
        welcome.grant(ALICE, share, 500e18);
        welcome.grant(BOB, share, 500e18);

        if (relayer != address(0)) welcome.setOperator(relayer, true);
        if (float_ > 0) {
            (bool ok,) = address(welcome).call{value: float_}("");
            require(ok, "float");
        }

        vm.stopBroadcast();

        _write(usernames, osmo, welcome, address(share), deployBlock, list);

        console.log("chain id        ", block.chainid);
        console.log("UsernameRegistry", address(usernames));
        console.log("Osmo            ", address(osmo));
        console.log("Welcome         ", address(welcome));
        console.log("Demo share NVDA ", address(share));
    }

    function _assets() internal pure returns (A[23] memory) {
        return [
            A("USD Coin (test)", "USDC", 6),
            A("Tether USD (test)", "USDT", 6),
            A("PayPal USD (test)", "PYUSD", 6),
            A("Dai (test)", "DAI", 18),
            A("Euro Coin (test)", "EURC", 6),
            A("NVIDIA (test)", "NVDA", 18),
            A("Tesla (test)", "TSLA", 18),
            A("Apple (test)", "AAPL", 18),
            A("Google (test)", "GOOGL", 18),
            A("Amazon (test)", "AMZN", 18),
            A("Meta (test)", "META", 18),
            A("Microsoft (test)", "MSFT", 18),
            A("Netflix (test)", "NFLX", 18),
            A("Coinbase (test)", "COIN", 18),
            A("Circle (test)", "CRCL", 18),
            A("PAX Gold (test)", "PAXG", 18),
            A("Tether Gold (test)", "XAUT", 18),
            A("Kinesis Silver (test)", "KAG", 18),
            A("Ondo US Dollar Yield (test)", "USDY", 18),
            A("BlackRock BUIDL (test)", "BUIDL", 18),
            A("Bitcoin (test)", "BTC", 18),
            A("Ethereum (test)", "ETH", 18),
            A("Solana (test)", "SOL", 18)
        ];
    }

    /// deployments/monad-testnet.json on Monad testnet, deployments/local.json on
    /// anvil (gitignored), deployments/<chain id>.json anywhere else. ABIs are
    /// added by `npm run contracts` in web/, from forge's build output.
    function _write(
        UsernameRegistry usernames,
        Osmo osmo,
        Welcome welcome,
        address share,
        uint256 deployBlock,
        A[23] memory list
    ) internal {
        bool testnet = block.chainid == 10143;
        string memory file = testnet
            ? "deployments/monad-testnet.json"
            : block.chainid == 31337
                ? "deployments/local.json"
                : string.concat("deployments/", vm.toString(block.chainid), ".json");

        string memory assetsJson;
        for (uint256 i; i < list.length; ++i) {
            assetsJson = vm.serializeAddress("assets", list[i].symbol, address(welcome.assetBySymbol(list[i].symbol)));
        }

        vm.serializeAddress("osmo", "address", address(osmo));
        string memory osmoJson = vm.serializeUint("osmo", "deployBlock", deployBlock);
        string memory registryJson = vm.serializeAddress("registry", "address", address(usernames));
        string memory welcomeJson = vm.serializeAddress("welcome", "address", address(welcome));

        vm.serializeString("contracts", "Osmo", osmoJson);
        vm.serializeString("contracts", "UsernameRegistry", registryJson);
        string memory contractsJson = vm.serializeString("contracts", "Welcome", welcomeJson);

        vm.serializeAddress("demo", "alice", ALICE);
        vm.serializeAddress("demo", "bob", BOB);
        string memory demoJson = vm.serializeAddress("demo", "share", share);

        vm.serializeString("root", "name", testnet ? "Monad testnet" : "local");
        vm.serializeUint("root", "chainId", block.chainid);
        vm.serializeString("root", "rpc", testnet ? "https://testnet-rpc.monad.xyz" : "http://127.0.0.1:8545");
        vm.serializeString("root", "explorer", testnet ? "https://testnet.monadvision.com" : "");
        vm.serializeString("root", "nativeSymbol", "MON");
        vm.serializeUint("root", "nativeDecimals", 18);
        vm.serializeUint("root", "deployBlock", deployBlock);
        vm.serializeAddress("root", "deployer", welcome.owner());
        vm.serializeString("root", "assets", assetsJson);
        vm.serializeString("root", "demoAccounts", demoJson);
        string memory out = vm.serializeString("root", "contracts", contractsJson);
        vm.writeJson(out, file);
        console.log("wrote", file);
    }
}
