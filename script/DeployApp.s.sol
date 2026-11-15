// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Welcome} from "../src/Welcome.sol";
import {DemoAsset} from "../src/DemoAsset.sol";

/// Adds the phone app's layer next to the Osmo and UsernameRegistry that are already deployed:
/// the Welcome contract, one DemoAsset clone per stock, coin, metal, treasury fund and stablecoin the app shows, the starter kit and the gas float.
///
///   OSMO=0xC2f251c89Fac09830dadAb1Fc67Da885F01Bb45e RELAYER=<server wallet address> \
///   script/with-deployer.sh forge script script/DeployApp.s.sol:DeployApp \
///     --rpc-url monad_testnet --account arc-deployer --broadcast
///
/// Env: OSMO (required), RELAYER (the app server's wallet, allowed to welcome and grant),
/// GAS_GRANT (wei per new wallet, default 0.1 MON), FLOAT (wei sent to Welcome, default 1 MON).
contract DeployApp is Script {
    struct A {
        string name;
        string symbol;
        uint8 decimals;
    }

    function run() external {
        address osmo = vm.envAddress("OSMO");
        address relayer = vm.envOr("RELAYER", address(0));
        uint256 gasGrant = vm.envOr("GAS_GRANT", uint256(0.1 ether));
        uint256 float_ = vm.envOr("FLOAT", uint256(1 ether));

        A[23] memory list = [
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

        vm.startBroadcast();
        Welcome w = new Welcome(osmo, gasGrant);
        for (uint256 i; i < list.length; ++i) {
            DemoAsset t = w.listAsset(list[i].name, list[i].symbol, list[i].decimals);
            console.log(list[i].symbol, address(t));
        }

        // Starter kit at the app's prices: $25 USDC, $15 NVIDIA, $10 Tesla, $10 Bitcoin.
        DemoAsset[] memory kit = new DemoAsset[](4);
        uint96[] memory amt = new uint96[](4);
        kit[0] = w.assetBySymbol("USDC");
        amt[0] = 25e6;
        kit[1] = w.assetBySymbol("NVDA");
        amt[1] = 0.0942e18;
        kit[2] = w.assetBySymbol("TSLA");
        amt[2] = 0.0261e18;
        kit[3] = w.assetBySymbol("BTC");
        amt[3] = 0.000147e18;
        w.setKit(kit, amt);

        if (relayer != address(0)) w.setOperator(relayer, true);
        if (float_ > 0) {
            (bool ok,) = address(w).call{value: float_}("");
            require(ok, "float");
        }
        vm.stopBroadcast();
        console.log("Welcome", address(w));
    }
}
