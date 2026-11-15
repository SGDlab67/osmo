// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MockShare} from "./mocks/MockShare.sol";
import {Osmo} from "../src/Osmo.sol";
import {UsernameRegistry} from "../src/UsernameRegistry.sol";

contract FlowTest is Test {
    MockShare share;
    MockShare other; // a second token, to prove the agent's limits are per token
    UsernameRegistry usernames;
    Osmo osmo;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address mallory = makeAddr("mallory");
    address agent = makeAddr("agent");

    string constant MEMO = unicode"pizza last night 🍕";

    function setUp() public {
        share = new MockShare("Mock Share", "mSHARE");
        other = new MockShare("Other Share", "oSHARE");
        usernames = new UsernameRegistry();
        osmo = new Osmo(usernames);

        share.mint(alice, 100e18);
        other.mint(alice, 100e18);

        vm.prank(alice);
        usernames.claim("alice");
        vm.prank(bob);
        usernames.claim("Bob"); // claimed with a capital, resolves either way
        vm.prank(mallory);
        usernames.claim("mallory");
    }

    // --- usernames ---

    function test_usernameResolvesCaseInsensitively() public view {
        assertEq(usernames.resolve("bob"), bob);
        assertEq(usernames.resolve("BOB"), bob);
        assertEq(usernames.resolve("Bob"), bob);
    }

    function test_usernameCannotBeTakenTwice() public {
        vm.prank(agent);
        vm.expectRevert(UsernameRegistry.NameTaken.selector);
        usernames.claim("ALICE");
    }

    function test_oneNamePerAddress() public {
        vm.prank(alice);
        vm.expectRevert(UsernameRegistry.AlreadyClaimed.selector);
        usernames.claim("alice2");
    }

    function test_rejectsBadNames() public {
        vm.startPrank(agent);
        vm.expectRevert(UsernameRegistry.BadName.selector);
        usernames.claim("ab"); // too short
        vm.expectRevert(UsernameRegistry.BadName.selector);
        usernames.claim("twenty_one_chars_long"); // too long
        vm.expectRevert(UsernameRegistry.BadName.selector);
        usernames.claim("has space");
        vm.expectRevert(UsernameRegistry.BadName.selector);
        usernames.claim(unicode"emoji_face_🙂");
        vm.stopPrank();
    }

    // --- sending by name ---

    function test_sendsAnyToken() public {
        vm.startPrank(alice);
        share.approve(address(osmo), 30e18);
        address to = osmo.sendToken(IERC20(address(share)), "bob", 30e18, MEMO);
        vm.stopPrank();

        assertEq(to, bob);
        assertEq(share.balanceOf(bob), 30e18);
        assertEq(share.balanceOf(alice), 70e18);
    }

    function test_sendFractionOfAShare() public {
        vm.startPrank(alice);
        share.approve(address(osmo), 1e18);
        osmo.sendToken(IERC20(address(share)), "bob", 0.25e18, "quarter share, happy birthday");
        vm.stopPrank();

        // the thing ACATS cannot do at all
        assertEq(share.balanceOf(bob), 0.25e18);
    }

    function test_sendEmitsTheMemo() public {
        vm.startPrank(alice);
        share.approve(address(osmo), 1e18);
        vm.expectEmit(true, true, true, true, address(osmo));
        emit Osmo.Sent(address(share), alice, bob, "bob", 1e18, MEMO, false);
        osmo.sendToken(IERC20(address(share)), "bob", 1e18, MEMO);
        vm.stopPrank();
    }

    function test_memoHasALimit() public {
        string memory tooLong = new string(141);
        vm.startPrank(alice);
        share.approve(address(osmo), 1e18);
        vm.expectRevert(Osmo.MemoTooLong.selector);
        osmo.sendToken(IERC20(address(share)), "bob", 1e18, tooLong);
        vm.stopPrank();
    }

    function test_sendsNativeCurrency() public {
        // On Monad the native currency is MON.
        vm.deal(alice, 5 ether);
        uint256 before = bob.balance;

        vm.prank(alice);
        osmo.sendNative{value: 2 ether}("bob", MEMO);

        assertEq(bob.balance - before, 2 ether);
        assertEq(alice.balance, 3 ether);
    }

    function test_rejectsEmptySends() public {
        vm.startPrank(alice);
        vm.expectRevert(Osmo.NothingToSend.selector);
        osmo.sendToken(IERC20(address(share)), "bob", 0, MEMO);
        vm.expectRevert(Osmo.NothingToSend.selector);
        osmo.sendNative("bob", MEMO);
        vm.stopPrank();
    }

    function test_rejectsUnclaimedName() public {
        vm.startPrank(alice);
        share.approve(address(osmo), 1e18);
        vm.expectRevert(UsernameRegistry.NoSuchName.selector);
        osmo.sendToken(IERC20(address(share)), "nobody", 1e18, MEMO);
        vm.stopPrank();
    }

    /// Osmo must never be able to hold anything.
    function testFuzz_osmoKeepsNoBalance(uint96 tokenAmount, uint96 nativeAmount) public {
        tokenAmount = uint96(bound(tokenAmount, 1, 100e18));
        nativeAmount = uint96(bound(nativeAmount, 1, 100 ether));
        vm.deal(alice, nativeAmount);

        vm.startPrank(alice);
        share.approve(address(osmo), tokenAmount);
        osmo.sendToken(IERC20(address(share)), "bob", tokenAmount, MEMO);
        osmo.sendNative{value: nativeAmount}("bob", MEMO);
        vm.stopPrank();

        assertEq(share.balanceOf(address(osmo)), 0);
        assertEq(address(osmo).balance, 0);
    }

    // --- the agent, and its limits ---

    function _authorizeAgent(uint128 perSend, uint128 perDay) private {
        vm.startPrank(alice);
        share.approve(address(osmo), type(uint256).max);
        osmo.authorizeAgent(agent);
        osmo.setLimit(address(share), perSend, perDay);
        vm.stopPrank();
    }

    function test_agentSendsWithinLimits() public {
        _authorizeAgent(10e18, 25e18);

        vm.prank(agent);
        address to = osmo.sendAsAgent(alice, IERC20(address(share)), "bob", 10e18, "rent, as you asked");

        assertEq(to, bob);
        assertEq(share.balanceOf(bob), 10e18);
        assertEq(osmo.remainingToday(alice, address(share)), 15e18);
    }

    function test_agentCannotExceedPerSendLimit() public {
        _authorizeAgent(10e18, 100e18);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Osmo.OverPerSendLimit.selector, 11e18, 10e18));
        osmo.sendAsAgent(alice, IERC20(address(share)), "bob", 11e18, MEMO);
    }

    function test_agentCannotExceedDailyLimit() public {
        _authorizeAgent(10e18, 25e18);

        vm.startPrank(agent);
        osmo.sendAsAgent(alice, IERC20(address(share)), "bob", 10e18, MEMO);
        osmo.sendAsAgent(alice, IERC20(address(share)), "bob", 10e18, MEMO);
        vm.expectRevert(abi.encodeWithSelector(Osmo.OverDailyLimit.selector, 30e18, 25e18));
        osmo.sendAsAgent(alice, IERC20(address(share)), "bob", 10e18, MEMO);
        vm.stopPrank();

        assertEq(osmo.remainingToday(alice, address(share)), 5e18);
    }

    function test_dailyLimitResetsTheNextDay() public {
        _authorizeAgent(10e18, 10e18);

        vm.prank(agent);
        osmo.sendAsAgent(alice, IERC20(address(share)), "bob", 10e18, MEMO);
        assertEq(osmo.remainingToday(alice, address(share)), 0);

        vm.warp(block.timestamp + 1 days);
        assertEq(osmo.remainingToday(alice, address(share)), 10e18);

        vm.prank(agent);
        osmo.sendAsAgent(alice, IERC20(address(share)), "bob", 10e18, MEMO);
        assertEq(share.balanceOf(bob), 20e18);
    }

    function test_freshAgentCanSendNothingUntilALimitIsSet() public {
        vm.startPrank(alice);
        share.approve(address(osmo), type(uint256).max);
        osmo.authorizeAgent(agent);
        vm.stopPrank();

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Osmo.OverPerSendLimit.selector, 1, 0));
        osmo.sendAsAgent(alice, IERC20(address(share)), "bob", 1, MEMO);
    }

    function test_revokingTheAgentIsImmediate() public {
        _authorizeAgent(10e18, 100e18);

        vm.prank(alice);
        osmo.authorizeAgent(address(0));

        vm.prank(agent);
        vm.expectRevert(Osmo.NotAgent.selector);
        osmo.sendAsAgent(alice, IERC20(address(share)), "bob", 1e18, MEMO);
    }

    function test_strangerCannotSendForYou() public {
        _authorizeAgent(10e18, 100e18);

        vm.prank(mallory);
        vm.expectRevert(Osmo.NotAgent.selector);
        osmo.sendAsAgent(alice, IERC20(address(share)), "bob", 1e18, MEMO);
    }

    /// Nobody has authorized an agent, so address(0) must not be one either.
    function test_unsetAgentIsNotAnAgent() public {
        vm.prank(address(0));
        vm.expectRevert(Osmo.NotAgent.selector);
        osmo.sendAsAgent(bob, IERC20(address(share)), "alice", 1e18, MEMO);
    }

    function test_agentLimitsArePerToken() public {
        _authorizeAgent(10e18, 10e18); // limit is on `share` only

        vm.prank(alice);
        other.approve(address(osmo), 20e18);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Osmo.OverPerSendLimit.selector, 1e18, 0));
        osmo.sendAsAgent(alice, IERC20(address(other)), "bob", 1e18, MEMO);
    }

    // --- standing orders ---

    uint48 constant WEEK = 7 days;

    function _weeklyOrder() private returns (uint256 id) {
        vm.startPrank(alice);
        share.approve(address(osmo), type(uint256).max);
        id = osmo.createOrder(IERC20(address(share)), "bob", 1e18, uint48(block.timestamp + WEEK), WEEK, MEMO);
        vm.stopPrank();
    }

    function test_anyoneRunsADueOrderAndItPaysWhatTheUserWrote() public {
        uint256 id = _weeklyOrder();

        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(Osmo.NotDue.selector, block.timestamp + WEEK));
        osmo.runOrder(id);

        skip(WEEK);
        vm.expectEmit();
        emit Osmo.Sent(address(share), alice, bob, "bob", 1e18, MEMO, true);
        vm.prank(mallory); // a stranger, who gains nothing and chooses nothing
        osmo.runOrder(id);

        assertEq(share.balanceOf(bob), 1e18);
        assertEq(share.balanceOf(mallory), 0);
        assertEq(share.balanceOf(address(osmo)), 0);
    }

    function test_orderPaysOncePerPeriod() public {
        uint256 id = _weeklyOrder();
        skip(WEEK);
        osmo.runOrder(id);

        vm.expectRevert(abi.encodeWithSelector(Osmo.NotDue.selector, block.timestamp + WEEK));
        osmo.runOrder(id);
    }

    function test_missedPeriodsAreSkippedNotPaidLater() public {
        uint256 id = _weeklyOrder();
        uint256 firstAt = block.timestamp + WEEK;

        skip(WEEK * 5 + 1 days); // due at week 1, nobody ran it until week 5 and a day
        osmo.runOrder(id);
        assertEq(share.balanceOf(bob), 1e18);

        // The next slot is week 6, still on the original weekday.
        vm.expectRevert(abi.encodeWithSelector(Osmo.NotDue.selector, firstAt + WEEK * 5));
        osmo.runOrder(id);
    }

    function test_onlyTheWriterCancelsAndACancelledOrderIsDead() public {
        uint256 id = _weeklyOrder();

        vm.prank(mallory);
        vm.expectRevert(Osmo.NotYourOrder.selector);
        osmo.cancelOrder(id);

        vm.prank(alice);
        osmo.cancelOrder(id);

        skip(WEEK);
        vm.expectRevert(Osmo.NoSuchOrder.selector);
        osmo.runOrder(id);
    }

    function test_orderNeedsARealRecipientAndInterval() public {
        vm.startPrank(alice);
        vm.expectRevert(UsernameRegistry.NoSuchName.selector);
        osmo.createOrder(IERC20(address(share)), "nobody", 1e18, 0, WEEK, MEMO);
        vm.expectRevert(Osmo.BadInterval.selector);
        osmo.createOrder(IERC20(address(share)), "bob", 1e18, 0, 0, MEMO);
        vm.expectRevert(Osmo.BadInterval.selector);
        osmo.createOrder(IERC20(address(share)), "bob", 1e18, 0, type(uint48).max, MEMO);
        vm.expectRevert(Osmo.NothingToSend.selector);
        osmo.createOrder(IERC20(address(share)), "bob", 0, 0, WEEK, MEMO);
        vm.stopPrank();
    }

    function test_revokingTheAllowanceStopsAnOrder() public {
        uint256 id = _weeklyOrder();
        vm.prank(alice);
        share.approve(address(osmo), 0);

        skip(WEEK);
        vm.expectRevert();
        osmo.runOrder(id);
        assertEq(share.balanceOf(bob), 0);
    }

    // --- the feed index ---

    function test_everyKindOfSendMarksItsBlockOnce() public {
        vm.deal(alice, 1 ether);
        _authorizeAgent(5e18, 20e18);
        uint256 id = _weeklyOrder();
        assertEq(osmo.sentBlockCount(), 0, "writing an order is not a send");

        vm.roll(100);
        vm.startPrank(alice);
        osmo.sendToken(IERC20(address(share)), "bob", 1e18, MEMO);
        osmo.sendNative{value: 1}("bob", MEMO);
        vm.stopPrank();
        assertEq(osmo.sentBlockCount(), 1, "two sends in one block are one entry");

        vm.roll(101);
        vm.prank(agent);
        osmo.sendAsAgent(alice, IERC20(address(share)), "bob", 1e18, MEMO);

        vm.roll(102);
        vm.warp(block.timestamp + WEEK); // the order falls due
        vm.prank(mallory);
        osmo.runOrder(id);

        assertEq(osmo.sentBlockCount(), 3);
        assertEq(osmo.sentBlocks(0), 100);
        assertEq(osmo.sentBlocks(1), 101);
        assertEq(osmo.sentBlocks(2), 102);
    }

    // --- claim links ---

    function _link(IERC20 token, uint256 value) private returns (uint256 id, uint256 key) {
        address keyAddr;
        (keyAddr, key) = makeAddrAndKey(string.concat("link", vm.toString(osmo.linkCount())));
        vm.startPrank(alice);
        share.approve(address(osmo), type(uint256).max);
        id = osmo.createLink{value: address(token) == address(0) ? value : 0}(token, value, keyAddr, MEMO);
        vm.stopPrank();
    }

    function _sign(uint256 key, uint256 id, address to) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, osmo.claimDigest(id, to));
        return abi.encodePacked(r, s, v);
    }

    function test_linkHolderClaimsToANewWalletAndAnyoneMaySubmit() public {
        address newcomer = makeAddr("newcomer"); // no name, no gas
        (uint256 id, uint256 key) = _link(IERC20(address(share)), 3e18);
        assertEq(share.balanceOf(address(osmo)), 3e18, "held until claimed");

        vm.expectEmit(address(osmo));
        emit Osmo.Sent(address(share), alice, newcomer, "", 3e18, MEMO, false);
        vm.prank(mallory); // a relayer pays the gas
        osmo.claimLink(id, newcomer, _sign(key, id, newcomer));

        assertEq(share.balanceOf(newcomer), 3e18);
        assertEq(share.balanceOf(address(osmo)), 0);
        assertEq(osmo.sentBlockCount(), 1, "a claim is in the feed");
    }

    function test_aClaimCannotBeRedirectedOrReplayed() public {
        (uint256 id, uint256 key) = _link(IERC20(address(share)), 3e18);
        bytes memory forBob = _sign(key, id, bob);

        vm.expectRevert(Osmo.BadClaimSignature.selector);
        osmo.claimLink(id, mallory, forBob); // copied from the mempool, new recipient

        (, uint256 otherKey) = makeAddrAndKey("not the link");
        bytes memory forged = _sign(otherKey, id, bob); // signed before expectRevert, which watches the next call
        vm.expectRevert(Osmo.BadClaimSignature.selector);
        osmo.claimLink(id, bob, forged);

        osmo.claimLink(id, bob, forBob);
        vm.expectRevert(Osmo.NoSuchLink.selector);
        osmo.claimLink(id, bob, forBob);
    }

    function test_nativeLinkAndOnlyTheSenderTakesItBack() public {
        vm.deal(alice, 5 ether);
        (uint256 id, uint256 key) = _link(IERC20(address(0)), 2 ether);
        assertEq(address(osmo).balance, 2 ether);

        vm.prank(mallory);
        vm.expectRevert(Osmo.NotYourLink.selector);
        osmo.reclaimLink(id);

        vm.prank(alice);
        osmo.reclaimLink(id);
        assertEq(alice.balance, 5 ether);

        bytes memory sig = _sign(key, id, bob);
        vm.expectRevert(Osmo.NoSuchLink.selector);
        osmo.claimLink(id, bob, sig);
    }

    function test_badLinksAreRefused() public {
        vm.deal(alice, 1 ether);
        vm.startPrank(alice);
        vm.expectRevert(Osmo.BadLink.selector);
        osmo.createLink(IERC20(address(share)), 1e18, address(0), MEMO); // no key
        vm.expectRevert(Osmo.BadLink.selector);
        osmo.createLink{value: 1}(IERC20(address(share)), 1e18, bob, MEMO); // MON with a token link
        vm.expectRevert(Osmo.BadLink.selector);
        osmo.createLink{value: 1}(IERC20(address(0)), 2, bob, MEMO); // value mismatch
        vm.expectRevert(Osmo.NothingToSend.selector);
        osmo.createLink(IERC20(address(share)), 0, bob, MEMO);
        vm.stopPrank();
    }
}
