// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AgentCardBase} from "./AgentCardBase.t.sol";
import {CardManager} from "../src/CardManager.sol";
import {SpendGate} from "../src/SpendGate.sol";
import {SpendRouter} from "../src/SpendRouter.sol";
import {MockMerchant} from "../src/mocks/MockMerchant.sol";
import {SpendAuth} from "../src/lib/AgentCardTypes.sol";

/// @notice Policies beyond limits: velocity rules that freeze a runaway agent, and owner
///         approval for one payment outside the card's limits.
contract VelocityAndEscalationTest is AgentCardBase {
    string internal constant PURPOSE = "Infrastructure for the team: hosting and API credits.";

    function _rules(uint16 maxBurst, uint32 window) internal {
        vm.prank(owner);
        cardManager.setRules(cardId, maxBurst, window, PURPOSE);
    }

    function _ownerApproval(SpendAuth memory auth, uint256 pk) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, gate.hashOwnerApproval(auth));
        return abi.encodePacked(r, s, v);
    }

    function _request(SpendAuth memory auth, bytes32[] memory proof) internal returns (bytes32 digest) {
        vm.prank(relayer);
        (digest,) = router.requestApproval(auth, _sign(auth, agentPk), proof, "DailyCapExceeded");
    }

    // --- rules -----------------------------------------------------------------------

    function test_issueCardWithRules_storesRuleAndPurpose() public {
        vm.prank(owner);
        (bytes32 id,) = cardManager.issueCardWithRules(
            makeAddr("agent2"), 10e6, bytes32(0), _ttl(), 5, 60, PURPOSE, "ipfs://agent-card"
        );
        CardManager.Card memory card = cardManager.getCard(id);
        assertEq(card.maxBurst, 5);
        assertEq(card.burstWindow, 60);
        assertEq(cardManager.purposeOf(id), PURPOSE);
    }

    function test_setRules_isOwnerOnlyAndConsistent() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(CardManager.NotCardOwner.selector);
        cardManager.setRules(cardId, 3, 60, PURPOSE);

        vm.prank(owner);
        vm.expectRevert(CardManager.InvalidRule.selector);
        cardManager.setRules(cardId, 3, 0, PURPOSE);
    }

    /// @dev Rules are not part of what the agent signs, so changing them must not void
    ///      authorisations already in flight.
    function test_setRules_doesNotBumpPolicyVersion() public {
        uint64 before = cardManager.getCard(cardId).policyVersion;
        _rules(3, 60);
        assertEq(cardManager.getCard(cardId).policyVersion, before);
    }

    // --- the gate only settles for the router ------------------------------------------

    function test_gate_refusesAnyoneButTheRouter() public {
        SpendAuth memory auth = _auth(address(merchantA), 1e6, 1);
        bytes memory sig = _sign(auth, agentPk);
        vm.prank(relayer);
        vm.expectRevert(SpendGate.NotRouter.selector);
        gate.spend(auth, sig, _noProof());
    }

    function test_gate_routerCanOnlyBeSetOnce() public {
        vm.expectRevert(SpendGate.RouterAlreadySet.selector);
        gate.setRouter(makeAddr("other"));
    }

    // --- velocity ---------------------------------------------------------------------

    function test_velocity_freezesOnABurst() public {
        _rules(3, 60);
        for (uint256 i = 1; i <= 3; i++) {
            (bool ok,) = _charge(merchantA, _auth(address(merchantA), 1e6, i), _noProof());
            assertTrue(ok, "within the burst");
        }

        (bool fourth, bytes4 reason) = _charge(merchantA, _auth(address(merchantA), 1e6, 4), _noProof());
        assertFalse(fourth);
        assertEq(reason, SpendRouter.VelocityExceeded.selector);
        assertTrue(router.frozen(cardId));

        (, bytes4 after_) = _charge(merchantA, _auth(address(merchantA), 1e6, 5), _noProof());
        assertEq(after_, SpendRouter.CardFrozen.selector, "frozen until the owner says otherwise");
    }

    /// @dev A loop of refusals is still a loop: refused attempts count too, because the
    ///      router's counter survives the gate's revert.
    function test_velocity_countsRefusedAttempts() public {
        _rules(2, 60);
        _charge(merchantA, _auth(address(merchantA), 200e6, 1), _noProof()); // over the cap
        _charge(merchantB, _auth(address(merchantB), 1e6, 2), _noProof()); // not allowed
        (, bytes4 reason) = _charge(merchantA, _auth(address(merchantA), 1e6, 3), _noProof());
        assertEq(reason, SpendRouter.VelocityExceeded.selector);
    }

    function test_velocity_windowResets() public {
        _rules(2, 60);
        _charge(merchantA, _auth(address(merchantA), 1e6, 1), _noProof());
        _charge(merchantA, _auth(address(merchantA), 1e6, 2), _noProof());
        vm.warp(block.timestamp + 61);
        (bool ok,) = _charge(merchantA, _auth(address(merchantA), 1e6, 3), _noProof());
        assertTrue(ok, "a new window");
        assertFalse(router.frozen(cardId));
    }

    function test_velocity_noRuleMeansNoFreeze() public {
        for (uint256 i = 1; i <= 20; i++) {
            _charge(merchantA, _auth(address(merchantA), 1e5, i), _noProof());
        }
        assertFalse(router.frozen(cardId));
    }

    function test_unfreeze_isOwnerOnlyAndRestoresSpending() public {
        _rules(1, 60);
        _charge(merchantA, _auth(address(merchantA), 1e6, 1), _noProof());
        _charge(merchantA, _auth(address(merchantA), 1e6, 2), _noProof());
        assertTrue(router.frozen(cardId));

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(SpendRouter.NotCardOwner.selector);
        router.unfreeze(cardId);

        vm.prank(owner);
        router.unfreeze(cardId);
        (bool ok,) = _charge(merchantA, _auth(address(merchantA), 1e6, 3), _noProof());
        assertTrue(ok);
    }

    function test_velocity_isRecordedAsAReasonedRefusal() public {
        _rules(1, 60);
        _charge(merchantA, _auth(address(merchantA), 1e6, 1), _noProof());
        _charge(merchantA, _auth(address(merchantA), 1e6, 2), _noProof());
        address[] memory clients = reputation.getClients(agentId);
        (uint64 count,,) = reputation.getSummary(agentId, clients, "VelocityExceeded", "declined");
        assertEq(count, 1);
    }

    // --- escalation -------------------------------------------------------------------

    function test_requestApproval_holdsThePayment() public {
        SpendAuth memory auth = _auth(address(merchantA), 80e6, 1);
        bytes32 digest = _request(auth, _noProof());

        assertEq(digest, gate.hashSpendAuth(auth));
        SpendRouter.Request memory r = router.getRequest(digest);
        assertEq(uint8(r.status), uint8(SpendRouter.Status.Open));
        assertEq(r.auth.amount, 80e6);
        assertEq(router.requestIdsOf(cardId).length, 1);
        assertEq(usd.balanceOf(address(merchantA)), 0, "nothing moves until the owner approves");
    }

    function test_requestApproval_needsTheAgentsSignature() public {
        SpendAuth memory auth = _auth(address(merchantA), 80e6, 1);
        bytes memory forged = _sign(auth, strangerPk);
        vm.expectRevert(SpendRouter.InvalidRequest.selector);
        router.requestApproval(auth, forged, _noProof(), "DailyCapExceeded");
    }

    function test_ownerApproval_settlesOverTheCap() public {
        SpendAuth memory auth = _auth(address(merchantA), 80e6, 1);
        bytes32 digest = _request(auth, _noProof());

        vm.prank(relayer);
        (bool ok,) = merchantA.chargeApproved(digest, _ownerApproval(auth, ownerPk));

        assertTrue(ok);
        assertEq(usd.balanceOf(address(merchantA)), 80e6);
        assertEq(uint8(router.getRequest(digest).status), uint8(SpendRouter.Status.Approved));
        assertEq(gate.remainingToday(cardId), 0, "the override still counts toward today");

        address[] memory clients = reputation.getClients(agentId);
        (uint64 overrides,,) = reputation.getSummary(agentId, clients, "OwnerApproved", "approved");
        assertEq(overrides, 1, "the record says the owner stepped in");
    }

    function test_ownerApproval_settlesAMerchantOffTheList() public {
        SpendAuth memory auth = _auth(address(merchantB), 5e6, 1);
        bytes32 digest = _request(auth, _noProof());
        vm.prank(relayer);
        (bool ok,) = merchantB.chargeApproved(digest, _ownerApproval(auth, ownerPk));
        assertTrue(ok);
        assertEq(usd.balanceOf(address(merchantB)), 5e6);
    }

    /// @dev A stranger's signature must not settle the payment, and must not close the
    ///      request either, or anyone could dismiss the owner's approvals.
    function test_ownerApproval_rejectsAStrangersSignature() public {
        SpendAuth memory auth = _auth(address(merchantA), 80e6, 1);
        bytes32 digest = _request(auth, _noProof());
        bytes memory wrong = _ownerApproval(auth, strangerPk);
        vm.prank(relayer);
        vm.expectRevert(SpendGate.BadOwnerSignature.selector);
        merchantA.chargeApproved(digest, wrong);
        assertEq(uint8(router.getRequest(digest).status), uint8(SpendRouter.Status.Open));
    }

    function test_ownerApproval_onlyByThePayee() public {
        SpendAuth memory auth = _auth(address(merchantA), 80e6, 1);
        bytes32 digest = _request(auth, _noProof());
        bytes memory approval = _ownerApproval(auth, ownerPk);
        vm.expectRevert(MockMerchant.NotThisMerchant.selector);
        merchantB.chargeApproved(digest, approval);
    }

    /// @dev Declining is submitting the payment as-is: the card's own rule refuses it, and
    ///      the request closes. After that, approval is no longer possible.
    function test_decline_recordsTheRefusalAndClosesTheRequest() public {
        SpendAuth memory auth = _auth(address(merchantA), 80e6, 1);
        bytes32 digest = _request(auth, _noProof());

        (bool ok, bytes4 reason) = _charge(merchantA, auth, _noProof());
        assertFalse(ok);
        assertEq(reason, SpendGate.DailyCapExceeded.selector);
        assertEq(uint8(router.getRequest(digest).status), uint8(SpendRouter.Status.Declined));

        bytes memory approval = _ownerApproval(auth, ownerPk);
        vm.expectRevert(SpendRouter.RequestNotOpen.selector);
        merchantA.chargeApproved(digest, approval);
    }

    /// @dev Revocation beats a pending approval: the card is dead, so the payment is
    ///      refused even with the owner's signature, and that refusal is recorded.
    function test_ownerApproval_cannotRaiseARevokedCard() public {
        SpendAuth memory auth = _auth(address(merchantA), 80e6, 1);
        bytes32 digest = _request(auth, _noProof());
        vm.prank(owner);
        cardManager.revoke(cardId);

        vm.prank(relayer);
        (bool ok, bytes4 reason) = merchantA.chargeApproved(digest, _ownerApproval(auth, ownerPk));
        assertFalse(ok);
        assertEq(reason, SpendGate.CardRevoked.selector);
        assertEq(uint8(router.getRequest(digest).status), uint8(SpendRouter.Status.Declined));
    }

    function test_requests_countTowardVelocity() public {
        _rules(2, 60);
        _request(_auth(address(merchantA), 80e6, 1), _noProof());
        _request(_auth(address(merchantA), 80e6, 2), _noProof());

        SpendAuth memory third = _auth(address(merchantA), 80e6, 3);
        bytes memory sig = _sign(third, agentPk);
        vm.prank(relayer);
        (bytes32 digest, bytes4 reason) = router.requestApproval(third, sig, _noProof(), "DailyCapExceeded");
        assertEq(digest, bytes32(0));
        assertEq(reason, SpendRouter.VelocityExceeded.selector);
        assertTrue(router.frozen(cardId), "a flood of requests freezes the card instead of the owner's phone");
    }
}
