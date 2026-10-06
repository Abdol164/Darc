// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {SpendGate} from "./SpendGate.sol";
import {CardManager} from "./CardManager.sol";
import {SpendAuth} from "./lib/AgentCardTypes.sol";

/// @title SpendRouter
/// @notice Makes REFUSALS on-chain, stops runaway agents, and holds payments that need the
///         owner's say.
///
/// @dev THE PATTERN, since judges will ask: a revert unwinds state AND erases events, so a
///      declined spend that reverts leaves no trace. The router calls SpendGate through
///      `try/catch`, so the inner revert still unwinds the spend's state (nothing is
///      settled, no nonce burned) while the router's own frame survives to emit
///      `SpendDeclined`. The decline is therefore permanent public data, paid for by the
///      submitter's gas.
///
///      The same property is why VELOCITY lives here and not in the gate: the router's
///      counters survive a refused attempt, so a loop of refusals still trips the freeze.
///      The gate only accepts calls from this router, so neither can be bypassed.
contract SpendRouter {
    SpendGate public immutable spendGate;
    CardManager public immutable cardManager;

    /// @notice Attempts in the card's current velocity window.
    struct Burst {
        uint64 windowStart;
        uint32 count;
    }

    enum Status {
        None,
        Open,
        Approved,
        Declined
    }

    /// @notice A payment held for the owner's approval, stored whole so the owner can
    ///         approve it from any device by signature alone.
    struct Request {
        SpendAuth auth;
        bytes agentSig;
        bytes32[] merchantProof;
        string reason;
        uint64 requestedAt;
        Status status;
    }

    mapping(bytes32 cardId => Burst) public burstOf;
    mapping(bytes32 cardId => bool) public frozen;

    mapping(bytes32 authDigest => Request) internal _requests;
    mapping(bytes32 cardId => bytes32[]) internal _requestIds;

    event SpendDeclined(
        bytes32 indexed cardId, address indexed merchant, uint256 amount, uint256 nonce, bytes4 reasonSelector
    );
    event CardFrozenByVelocity(bytes32 indexed cardId, uint32 attempts, uint32 window);
    event CardUnfrozen(bytes32 indexed cardId);
    event ApprovalRequested(
        bytes32 indexed cardId,
        bytes32 indexed authDigest,
        address indexed merchant,
        uint256 amount,
        string reason
    );
    event RequestResolved(bytes32 indexed cardId, bytes32 indexed authDigest, bool approved);

    /// @notice Decline reasons raised here rather than in the gate. Never thrown: they are
    ///         reported as selectors, like the gate's.
    error VelocityExceeded();
    error CardFrozen();

    error NotCardOwner();
    error RequestNotOpen();
    error InvalidRequest();

    /// @dev Returned when the inner call produced no decodable error selector (an empty
    ///      revert, or an out-of-gas that `try/catch` cannot capture as data).
    bytes4 public constant UNKNOWN_REASON = 0xffffffff;

    constructor(address spendGate_, address cardManager_) {
        spendGate = SpendGate(spendGate_);
        cardManager = CardManager(cardManager_);
    }

    /// @notice Attempt a spend; never reverts on a policy decline.
    /// @return ok True if the spend settled.
    /// @return reasonSelector Zero on success, else the custom-error selector.
    function submit(SpendAuth calldata auth, bytes calldata agentSig, bytes32[] calldata merchantProof)
        external
        returns (bool ok, bytes4 reasonSelector)
    {
        reasonSelector = _countAttempt(auth.cardId);
        if (reasonSelector == bytes4(0)) {
            try spendGate.spend(auth, agentSig, merchantProof) {
                ok = true;
            } catch (bytes memory err) {
                reasonSelector = err.length >= 4 ? bytes4(err) : UNKNOWN_REASON;
            }
        }
        if (!ok) emit SpendDeclined(auth.cardId, auth.merchant, auth.amount, auth.nonce, reasonSelector);

        // Submitting a held payment as-is resolves its request: this is how an owner's
        // "decline" reaches the record, as the refusal the card's rules produce.
        bytes32 digest = spendGate.hashSpendAuth(auth);
        if (_requests[digest].status == Status.Open) _resolve(auth.cardId, digest, ok);
    }

    /// @notice Hold a payment for the owner's approval instead of refusing it.
    /// @dev Permissionless to SUBMIT, like `submit`: the agent's signature over the payment
    ///      is checked here, so nobody can file a request on a card they do not hold the key
    ///      for. Requests count toward the velocity rule, so a loop of them freezes the card
    ///      instead of flooding the owner.
    /// @return authDigest The request's id, or zero if the card was frozen by this attempt.
    /// @return reasonSelector Zero when held, else why it was not.
    function requestApproval(
        SpendAuth calldata auth,
        bytes calldata agentSig,
        bytes32[] calldata merchantProof,
        string calldata reason
    ) external returns (bytes32 authDigest, bytes4 reasonSelector) {
        CardManager.Card memory card = cardManager.getCard(auth.cardId);
        if (card.agentKey == address(0) || card.revoked || card.validUntil <= block.timestamp) {
            revert InvalidRequest();
        }
        if (auth.deadline < block.timestamp) revert InvalidRequest();

        authDigest = spendGate.hashSpendAuth(auth);
        if (ECDSA.recover(authDigest, agentSig) != card.agentKey) revert InvalidRequest();
        if (_requests[authDigest].status != Status.None) revert InvalidRequest();

        reasonSelector = _countAttempt(auth.cardId);
        if (reasonSelector != bytes4(0)) {
            emit SpendDeclined(auth.cardId, auth.merchant, auth.amount, auth.nonce, reasonSelector);
            return (bytes32(0), reasonSelector);
        }

        Request storage r = _requests[authDigest];
        r.auth = auth;
        r.agentSig = agentSig;
        r.merchantProof = merchantProof;
        r.reason = reason;
        r.requestedAt = uint64(block.timestamp);
        r.status = Status.Open;
        _requestIds[auth.cardId].push(authDigest);

        emit ApprovalRequested(auth.cardId, authDigest, auth.merchant, auth.amount, reason);
    }

    /// @notice Settle a held payment with the owner's signature over it.
    /// @dev A bad owner signature reverts outright rather than closing the request, so a
    ///      stranger cannot dismiss the owner's pending approvals with garbage.
    function submitApproved(bytes32 authDigest, bytes calldata ownerSig)
        external
        returns (bool ok, bytes4 reasonSelector)
    {
        Request storage r = _requests[authDigest];
        if (r.status != Status.Open) revert RequestNotOpen();

        try spendGate.spendApproved(r.auth, r.agentSig, ownerSig) {
            ok = true;
        } catch (bytes memory err) {
            reasonSelector = err.length >= 4 ? bytes4(err) : UNKNOWN_REASON;
            if (reasonSelector == SpendGate.BadOwnerSignature.selector) revert SpendGate.BadOwnerSignature();
            emit SpendDeclined(r.auth.cardId, r.auth.merchant, r.auth.amount, r.auth.nonce, reasonSelector);
        }
        _resolve(r.auth.cardId, authDigest, ok);
    }

    /// @notice Lift a velocity freeze. Only the card's owner can, and the window restarts.
    function unfreeze(bytes32 cardId) external {
        if (cardManager.getCard(cardId).owner != msg.sender) revert NotCardOwner();
        frozen[cardId] = false;
        delete burstOf[cardId];
        emit CardUnfrozen(cardId);
    }

    function requestIdsOf(bytes32 cardId) external view returns (bytes32[] memory) {
        return _requestIds[cardId];
    }

    function getRequest(bytes32 authDigest) external view returns (Request memory) {
        return _requests[authDigest];
    }

    /// @dev Velocity, checked before anything else. Returns a decline selector, or zero.
    function _countAttempt(bytes32 cardId) internal returns (bytes4) {
        if (frozen[cardId]) return CardFrozen.selector;

        CardManager.Card memory card = cardManager.getCard(cardId);
        if (card.maxBurst == 0) return bytes4(0);

        // A fixed window that opens at the first attempt after the last one closed: simple,
        // cheap, and enough to catch a loop. Not a trailing window, by design.
        Burst storage b = burstOf[cardId];
        if (block.timestamp >= uint256(b.windowStart) + card.burstWindow) {
            b.windowStart = uint64(block.timestamp);
            b.count = 0;
        }
        b.count += 1;
        if (b.count > card.maxBurst) {
            frozen[cardId] = true;
            emit CardFrozenByVelocity(cardId, b.count, card.burstWindow);
            return VelocityExceeded.selector;
        }
        return bytes4(0);
    }

    function _resolve(bytes32 cardId, bytes32 authDigest, bool approved) internal {
        _requests[authDigest].status = approved ? Status.Approved : Status.Declined;
        emit RequestResolved(cardId, authDigest, approved);
    }
}
