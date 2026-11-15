// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Charities} from "../src/Charities.sol";

contract CharitiesTest is Test {
    Charities charities;
    address curator = address(this);
    address stranger = makeAddr("stranger");
    address a = makeAddr("charityA");
    address b = makeAddr("charityB");
    bytes32 constant HA = keccak256("record a");
    bytes32 constant HB = keccak256("record b");

    event CharityAdded(address indexed charity, bytes32 metaHash);
    event CharityRevoked(address indexed charity);

    function setUp() public {
        charities = new Charities();
    }

    function test_addStoresHashVerifiedAndOrder() public {
        vm.expectEmit(true, false, false, true);
        emit CharityAdded(a, HA);
        charities.add(a, HA);
        charities.add(b, HB);
        assertEq(charities.metaHashOf(a), HA);
        assertTrue(charities.isVerified(a));
        assertEq(charities.list(0), a);
        assertEq(charities.list(1), b);
        assertEq(charities.count(), 2);
    }

    function test_addManyListsAllInOrder() public {
        address[] memory w = new address[](2);
        bytes32[] memory h = new bytes32[](2);
        (w[0], w[1], h[0], h[1]) = (a, b, HA, HB);
        charities.addMany(w, h);
        assertEq(charities.count(), 2);
        assertEq(charities.list(1), b);
        assertEq(charities.metaHashOf(b), HB);
    }

    function test_addManyRejectsMismatchedLengths() public {
        address[] memory w = new address[](2);
        bytes32[] memory h = new bytes32[](1);
        vm.expectRevert(Charities.LengthMismatch.selector);
        charities.addMany(w, h);
    }

    function test_onlyOwnerCanCurate() public {
        charities.add(a, HA);
        vm.startPrank(stranger);
        vm.expectRevert(Charities.NotOwner.selector);
        charities.add(b, HB);
        vm.expectRevert(Charities.NotOwner.selector);
        charities.revoke(a);
        vm.expectRevert(Charities.NotOwner.selector);
        charities.setOwner(stranger);
        vm.expectRevert(Charities.NotOwner.selector);
        charities.addMany(new address[](0), new bytes32[](0));
        vm.stopPrank();
    }

    function test_setOwnerHandsOverCuration() public {
        charities.setOwner(stranger);
        assertEq(charities.owner(), stranger);
        vm.expectRevert(Charities.NotOwner.selector);
        charities.add(a, HA);
        vm.prank(stranger);
        charities.add(a, HA);
        assertTrue(charities.isVerified(a));
    }

    function test_rejectsZeroAddressZeroHashAndDuplicates() public {
        vm.expectRevert(Charities.ZeroAddress.selector);
        charities.add(address(0), HA);
        vm.expectRevert(Charities.ZeroHash.selector);
        charities.add(a, bytes32(0));
        charities.add(a, HA);
        vm.expectRevert(Charities.AlreadyListed.selector);
        charities.add(a, HB);
        vm.expectRevert(Charities.ZeroAddress.selector);
        charities.setOwner(address(0));
    }

    function test_revokeKeepsHistory() public {
        charities.add(a, HA);
        vm.expectEmit(true, false, false, false);
        emit CharityRevoked(a);
        charities.revoke(a);
        assertFalse(charities.isVerified(a));
        assertEq(charities.metaHashOf(a), HA);
        assertEq(charities.count(), 1);
        vm.expectRevert(Charities.AlreadyListed.selector);
        charities.add(a, HB);
    }

    function test_revokeUnlistedReverts() public {
        vm.expectRevert(Charities.NotListed.selector);
        charities.revoke(a);
    }

    function testFuzz_neverAddedIsNeverVerified(address x) public {
        vm.assume(x != a);
        charities.add(a, HA);
        assertFalse(charities.isVerified(x));
        assertEq(charities.metaHashOf(x), bytes32(0));
    }

    /// Charities has no payable function and no receive, so it can never hold MON.
    function test_cannotReceiveMoney() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool ok,) = address(charities).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(charities).balance, 0);
    }
}
