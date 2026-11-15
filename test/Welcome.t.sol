// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Osmo} from "../src/Osmo.sol";
import {UsernameRegistry} from "../src/UsernameRegistry.sol";
import {Welcome} from "../src/Welcome.sol";
import {DemoAsset} from "../src/DemoAsset.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// The phone app's path end to end: welcome a new wallet, claim a name, pay a friend in a stock with no approve.
contract WelcomeTest is Test {
    UsernameRegistry names;
    Osmo gram;
    Welcome welcome;
    DemoAsset usdc;
    DemoAsset nvda;
    address server = makeAddr("server");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        names = new UsernameRegistry();
        gram = new Osmo(names);
        welcome = new Welcome(address(gram), 0.2 ether);
        usdc = welcome.listAsset("USD Coin (test)", "USDC", 6);
        nvda = welcome.listAsset("NVIDIA (test)", "NVDA", 18);
        DemoAsset[] memory t = new DemoAsset[](2);
        t[0] = usdc;
        t[1] = nvda;
        uint96[] memory a = new uint96[](2);
        a[0] = 25e6;
        a[1] = 0.0942e18;
        welcome.setKit(t, a);
        welcome.setOperator(server, true);
        vm.deal(address(welcome), 10 ether);
    }

    function _join(address who, string memory handle) internal {
        vm.prank(server);
        welcome.welcome(who, "Test|fox|US");
        vm.prank(who);
        names.claim(handle);
    }

    function test_welcomeGivesKitAndGasOnce() public {
        vm.startPrank(server);
        welcome.welcome(alice, "Alice Park|fox|US");
        welcome.welcome(alice, "ignored");
        vm.stopPrank();
        assertEq(usdc.balanceOf(alice), 25e6);
        assertEq(nvda.balanceOf(alice), 0.0942e18);
        assertEq(alice.balance, 0.2 ether);
        assertEq(welcome.memberCount(), 1);
        assertEq(welcome.members(0), alice);
        assertEq(welcome.profileOf(alice), "Alice Park|fox|US");
    }

    function test_profileUpdatesOnlyForMembers() public {
        vm.prank(bob);
        vm.expectRevert(Welcome.NotMember.selector);
        welcome.setProfile("Bob|frog|CA");
        _join(bob, "bob");
        vm.prank(bob);
        welcome.setProfile("Bob Lee|frog|CA");
        assertEq(welcome.profileOf(bob), "Bob Lee|frog|CA");
        vm.prank(bob);
        vm.expectRevert(Welcome.ProfileTooLong.selector);
        welcome.setProfile(
            "0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890"
        );
    }

    function test_requestsOpenAndClose() public {
        _join(alice, "alice");
        _join(bob, "bob");
        vm.prank(alice);
        uint256 id = welcome.request(bob, 2200, "ramen");
        vm.prank(alice);
        vm.expectRevert(Welcome.NotYours.selector);
        welcome.closeRequest(id, Welcome.Status.Paid);
        vm.prank(bob);
        welcome.closeRequest(id, Welcome.Status.Paid);
        (,, uint64 cents, Welcome.Status st, string memory note) = welcome.requests(id);
        assertEq(cents, 2200);
        assertEq(uint8(st), uint8(Welcome.Status.Paid));
        assertEq(note, "ramen");
        vm.prank(bob);
        vm.expectRevert(Welcome.NotOpen.selector);
        welcome.closeRequest(id, Welcome.Status.Declined);
        vm.prank(carol);
        vm.expectRevert(Welcome.NotMember.selector);
        welcome.request(alice, 100, "x");
    }

    function test_assetsAreClonesWithTheirOwnNames() public view {
        assertEq(usdc.symbol(), "USDC");
        assertEq(usdc.decimals(), 6);
        assertEq(nvda.symbol(), "NVDA");
        assertEq(nvda.minter(), address(welcome));
        assertEq(nvda.spender(), address(gram));
    }

    function test_onlyOperator() public {
        vm.prank(alice);
        vm.expectRevert(Welcome.NotOperator.selector);
        welcome.welcome(alice, "");
        vm.prank(alice);
        vm.expectRevert(Welcome.NotOperator.selector);
        welcome.grant(alice, usdc, 1);
    }

    function test_payAStockByNameWithNoApprove() public {
        _join(alice, "alice");
        _join(bob, "bob");
        vm.prank(alice);
        gram.sendToken(IERC20(address(nvda)), "bob", 0.02e18, unicode"🍕 pizza");
        assertEq(nvda.balanceOf(bob), 0.0942e18 + 0.02e18);
        assertEq(nvda.balanceOf(alice), 0.0742e18);
        assertEq(gram.sentBlockCount(), 1);
    }

    function test_onlyOsmoSkipsApproval() public {
        _join(alice, "alice");
        vm.prank(bob);
        vm.expectRevert(DemoAsset.InsufficientAllowance.selector);
        usdc.transferFrom(alice, bob, 1e6);
        assertEq(usdc.allowance(alice, address(gram)), type(uint256).max);
    }

    function test_onlyWelcomeMints() public {
        vm.expectRevert(DemoAsset.NotMinter.selector);
        usdc.mint(alice, 1);
    }

    function test_buyGrantsAndRejectsUnknown() public {
        vm.startPrank(server);
        welcome.grant(alice, nvda, 1e18);
        vm.expectRevert(Welcome.UnknownAsset.selector);
        welcome.grant(alice, DemoAsset(address(0xbeef)), 1);
        vm.stopPrank();
        assertEq(nvda.balanceOf(alice), 1e18);
    }

    function test_floatRunsDryWithoutReverting() public {
        Welcome poor = new Welcome(address(gram), 0.2 ether);
        vm.deal(address(poor), 0.05 ether);
        poor.welcome(alice, "");
        assertEq(alice.balance, 0.05 ether);
        poor.welcome(bob, "");
        assertEq(bob.balance, 0);
    }
}
