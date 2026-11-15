// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {Charities} from "../src/Charities.sol";

/// Deploys only the Charities registry and records it in the existing deployments file under
/// `contracts.Charities`, leaving every other key as it is. Run it with the wallet that owns Welcome,
/// which becomes the curator:
///
///   DEPLOYER_KEYCHAIN_ITEM=<item> script/with-deployer.sh forge script script/DeployCharities.s.sol:DeployCharities \
///     --account <keystore> --broadcast --rpc-url monad_testnet
///   cd web && npm run contracts && npm run seed:charities
///
/// The curator is whoever broadcasts, by construction (the constructor sets owner = msg.sender of the
/// deploy transaction). Nothing here reads `msg.sender`, which in a script is the simulation sender.
contract DeployCharities is Script {
    function run() external {
        string memory file = _file();
        require(vm.exists(file), string.concat(file, " not found: run script/Deploy.s.sol first"));
        require(vm.keyExistsJson(vm.readFile(file), ".contracts"), string.concat(file, " has no contracts object"));

        uint256 deployBlock = block.number;
        vm.startBroadcast();
        Charities charities = new Charities();
        vm.stopBroadcast();

        console.log("Charities", address(charities));
        console.log("curator  ", charities.owner());

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume)) {
            vm.serializeAddress("charities", "address", address(charities));
            string memory json = vm.serializeUint("charities", "deployBlock", deployBlock);
            vm.writeJson(json, file, ".contracts.Charities");
            console.log("wrote", file);
        } else {
            console.log("dry run: deployments file left as it is");
        }
    }

    function _file() internal view returns (string memory) {
        if (block.chainid == 10143) return "deployments/monad-testnet.json";
        if (block.chainid == 31337) return "deployments/local.json";
        return string.concat("deployments/", vm.toString(block.chainid), ".json");
    }
}
