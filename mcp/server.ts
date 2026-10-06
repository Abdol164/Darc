/**
 * Darc MCP server: hands an AI agent a Darc card.
 *
 * Any MCP client (Claude Code, Claude Desktop, …) can then check the card and pay with it.
 * The agent holds only the card's agent key: it signs payment authorisations and nothing
 * else. Darc's relayer submits them and pays the gas, and the chain decides. A refusal comes
 * back as a named reason the model has to reason about, and it lands in the public record
 * either way.
 *
 * Self-contained on purpose, like scripts/demo.ts: it imports only config/*.ts, lib/merkle.ts
 * and viem, because the rest of lib/ uses "@/" path aliases that plain Node cannot resolve.
 *
 *   DARC_URL=https://…  DARC_CARD_ID=0x…  DARC_AGENT_KEY=0x…  DARC_MERCHANTS=0x…,0x…  node mcp/server.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPublicClient, defineChain, getAddress, http, isAddress, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MONAD_TESTNET, RPC_URL } from "../config/chain.ts";
import { ADDRESSES } from "../config/addresses.ts";
import { merchantProof } from "../lib/merkle.ts";

// ---- configuration ------------------------------------------------------------------------

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`darc-mcp: ${name} is not set. Copy the command from "Connect an agent" on the card's page.`);
    process.exit(1);
  }
  return value;
}

const DARC_URL = (process.env.DARC_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
const CARD_ID = required("DARC_CARD_ID") as Hex;
const agent = privateKeyToAccount(required("DARC_AGENT_KEY") as Hex);
/** The card's allow-list, needed to prove a merchant is on it. Empty means any merchant. */
const ALLOWED: Address[] = (process.env.DARC_MERCHANTS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => isAddress(s))
  .map((s) => getAddress(s));

// ---- chain ------------------------------------------------------------------------------------

const chain = defineChain(MONAD_TESTNET);
const client = createPublicClient({ chain, transport: http(RPC_URL) });
const explorer = MONAD_TESTNET.blockExplorers.default.url;

const cardManagerAbi = parseAbi([
  "struct Card { address agentKey; address owner; uint256 dailyCap; bytes32 merchantRoot; uint64 validUntil; uint64 issuedAt; bool revoked; uint64 policyVersion; uint16 maxBurst; uint32 burstWindow; }",
  "function getCard(bytes32 cardId) view returns (Card)",
  "function purposeOf(bytes32 cardId) view returns (string)",
]);
const spendRouterAbi = parseAbi([
  "struct SpendAuth { bytes32 cardId; address merchant; address token; uint256 amount; uint256 nonce; uint256 deadline; uint64 policyVersion; }",
  "struct Request { SpendAuth auth; bytes agentSig; bytes32[] merchantProof; string reason; uint64 requestedAt; uint8 status; }",
  "function frozen(bytes32 cardId) view returns (bool)",
  "function getRequest(bytes32 authDigest) view returns (Request)",
]);
const spendGateAbi = parseAbi(["function remainingToday(bytes32 cardId) view returns (uint256)"]);
const merchantNameAbi = parseAbi(["function name() view returns (string)"]);

/** Must match SPEND_AUTH_TYPEHASH in Solidity (pinned by CrossLanguageConstants.t.sol). */
const SPEND_AUTH_TYPES = {
  SpendAuth: [
    { name: "cardId", type: "bytes32" },
    { name: "merchant", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "policyVersion", type: "uint64" },
  ],
} as const;

/** The relayer only accepts these: they are the merchants deployed for Darc on testnet. */
const MERCHANTS = [ADDRESSES.mockMerchantA, ADDRESSES.mockMerchantB, ADDRESSES.mockMerchantC] as Address[];

const usd = (v: bigint) => `$${(Number(v) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

let names: Map<string, string> | undefined;
/** Merchant names are stored on-chain in each merchant contract. */
async function merchantNames(): Promise<Map<string, string>> {
  if (names) return names;
  const entries = await Promise.all(
    MERCHANTS.map(async (m) => {
      const name = await client.readContract({ address: m, abi: merchantNameAbi, functionName: "name" }).catch(() => m);
      return [m.toLowerCase(), name] as const;
    }),
  );
  names = new Map(entries);
  return names;
}

const isAllowed = (m: Address) => ALLOWED.length === 0 || ALLOWED.some((a) => a.toLowerCase() === m.toLowerCase());

async function readCard() {
  const [card, remaining, frozen, purpose] = await Promise.all([
    client.readContract({ address: ADDRESSES.cardManager, abi: cardManagerAbi, functionName: "getCard", args: [CARD_ID] }),
    client.readContract({ address: ADDRESSES.spendGate, abi: spendGateAbi, functionName: "remainingToday", args: [CARD_ID] }),
    client.readContract({ address: ADDRESSES.spendRouter, abi: spendRouterAbi, functionName: "frozen", args: [CARD_ID] }),
    client.readContract({ address: ADDRESSES.cardManager, abi: cardManagerAbi, functionName: "purposeOf", args: [CARD_ID] }),
  ]);
  return { card, remaining, frozen, purpose };
}

/** What each refusal means for the agent, in the order SpendGate checks them. */
const MEANING: Record<string, string> = {
  CardNotFound: "This card does not exist. Check the card id you were given.",
  CardRevoked: "The owner revoked this card. Stop: no payment with it can ever succeed again.",
  CardExpired: "The card is past its validity date. Stop and ask the owner for a new card.",
  DeadlineExpired: "The authorisation expired before it was submitted. Try again.",
  TokenNotAllowed: "The card only pays in its own settlement token.",
  PolicyVersionStale: "The owner changed the card's rules since this was signed. Check card_status and try again under the new limits.",
  BadAgentSignature: "The signature did not come from this card's agent key. The configured key is wrong.",
  NonceUsed: "This exact authorisation was already used. Make a fresh payment instead of replaying it.",
  MerchantNotAllowed: "This merchant is not on the card's allow-list. Retrying cannot help; ask the owner to add it.",
  DailyCapExceeded: "That is more than today's remaining limit. The limit resets at 00:00 UTC; pay less or wait.",
  VelocityExceeded: "Too many attempts too quickly: the card has frozen itself. Stop; only the owner can unfreeze it.",
  CardFrozen: "The card is frozen after a burst of attempts. Stop; only the owner can unfreeze it.",
};

// ---- the server ---------------------------------------------------------------------------

const server = new McpServer({ name: "darc", version: "1.0.0" });

server.registerTool(
  "card_status",
  {
    title: "Check the Darc card",
    description:
      "Read this agent's Darc spending card from the chain: what it is for, its daily limit, what is left today, which merchants it may pay, its velocity rule, and whether it is frozen, revoked or expired. Check it before paying.",
  },
  async () => {
    const [{ card, remaining, frozen, purpose }, nameOf] = await Promise.all([readCard(), merchantNames()]);
    if (card.agentKey === "0x0000000000000000000000000000000000000000") {
      return { isError: true, content: [{ type: "text", text: "No card exists with the configured DARC_CARD_ID." }] };
    }
    const mismatched = card.agentKey.toLowerCase() !== agent.address.toLowerCase();
    const expired = Number(card.validUntil) * 1000 <= Date.now();
    const status = {
      card: CARD_ID,
      agent: agent.address,
      standing: card.revoked ? "revoked" : expired ? "expired" : frozen ? "frozen" : "active",
      purpose: purpose || "not stated",
      dailyLimit: usd(card.dailyCap),
      remainingToday: card.revoked ? "$0" : usd(remaining),
      merchants: ALLOWED.length === 0 ? "any merchant" : ALLOWED.map((m) => nameOf.get(m.toLowerCase()) ?? m),
      velocityRule: card.maxBurst ? `freezes after ${card.maxBurst} attempts in ${card.burstWindow} seconds` : "none",
      validUntil: new Date(Number(card.validUntil) * 1000).toISOString(),
      policyVersion: Number(card.policyVersion),
      record: `${DARC_URL}/verify?agent=${agent.address}`,
    };
    const warning = mismatched ? "\nWarning: the configured agent key is not this card's key, so payments will be refused." : "";
    return { content: [{ type: "text", text: JSON.stringify(status, null, 2) + warning }] };
  },
);

server.registerTool(
  "list_merchants",
  {
    title: "List merchants",
    description: "List the merchants this card can be used with on Darc's testnet, and whether this card allows each one.",
  },
  async () => {
    const nameOf = await merchantNames();
    const rows = MERCHANTS.map((m) => ({
      name: nameOf.get(m.toLowerCase()) ?? m,
      address: m,
      allowedByThisCard: isAllowed(m),
    }));
    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
  },
);

server.registerTool(
  "pay",
  {
    title: "Pay with the Darc card",
    description:
      "Pay a merchant with this agent's Darc card. You sign a payment authorisation; the chain checks it against the card's rules and either settles it in AUSD, holds it for the owner's approval, or refuses it with a named reason. A payment over the limit, at a merchant off the card's list, or that does not fit the card's purpose is held rather than refused: the owner is asked on their devices, and you can check it with approval_status. Refusals are final for that attempt and are recorded publicly, so read the reason before trying anything else.",
    inputSchema: {
      merchant: z.string().describe("The merchant's name (or part of it) or its 0x address, from list_merchants."),
      amountUsd: z.number().positive().max(100000).describe("Amount in US dollars (settled in AUSD)."),
      purpose: z.string().min(3).describe("What the payment is for, in a short phrase."),
    },
  },
  async ({ merchant, amountUsd, purpose }) => {
    const nameOf = await merchantNames();
    const wanted = merchant.trim().toLowerCase();
    const target = MERCHANTS.find(
      (m) => m.toLowerCase() === wanted || (nameOf.get(m.toLowerCase()) ?? "").toLowerCase().includes(wanted),
    );
    if (!target) {
      return {
        isError: true,
        content: [{ type: "text", text: `No Darc merchant matches "${merchant}". Call list_merchants to see them.` }],
      };
    }
    const merchantName = nameOf.get(target.toLowerCase()) ?? target;

    // Sign under the card's current policy version, as an agent following the rules would.
    const { card } = await readCard();
    const auth = {
      cardId: CARD_ID,
      merchant: target,
      token: ADDRESSES.paymentToken as Address,
      amount: BigInt(Math.round(amountUsd * 1e6)),
      nonce: BigInt(Date.now()),
      // Ten minutes: long enough for the owner to approve a held payment from their phone.
      deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
      policyVersion: card.policyVersion,
    };
    const signature = await agent.signTypedData({
      domain: { name: "AgentCard", version: "1", chainId: chain.id, verifyingContract: ADDRESSES.spendGate as Address },
      types: SPEND_AUTH_TYPES,
      primaryType: "SpendAuth",
      message: auth,
    });

    const res = await fetch(`${DARC_URL}/api/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        auth: {
          ...auth,
          amount: auth.amount.toString(),
          nonce: auth.nonce.toString(),
          deadline: auth.deadline.toString(),
          policyVersion: auth.policyVersion.toString(),
        },
        signature,
        proof: merchantProof(ALLOWED, target),
        // Checked against the card's stated purpose before anything is submitted.
        memo: purpose,
      }),
    }).catch((err: unknown) => {
      throw new Error(`Could not reach Darc at ${DARC_URL}: ${err instanceof Error ? err.message : String(err)}`);
    });
    const data = (await res.json()) as {
      ok?: boolean;
      pending?: boolean;
      requestId?: string;
      reason?: string | null;
      hash?: string;
      blockNumber?: string;
      settleMs?: number;
      error?: string;
    };
    if (!res.ok || data.error) {
      return { isError: true, content: [{ type: "text", text: `Darc's relayer could not submit the payment: ${data.error ?? res.status}` }] };
    }

    const tx = data.hash ? `${explorer}/tx/${data.hash}` : "";
    const timing = `Recorded on Monad in ${((data.settleMs ?? 0) / 1000).toFixed(2)} s at block #${data.blockNumber}.`;
    const text = data.pending
      ? `Held for the owner's approval: ${data.reason}. Nothing has moved yet; the owner has been asked on their devices and can approve it with their passkey before the authorisation lapses in about ten minutes. Request id: ${data.requestId}. Check it later with approval_status; do not retry the same payment. ${timing}\n${tx}`
      : data.ok
        ? `Approved: paid $${amountUsd} to ${merchantName} for "${purpose}". ${timing}\n${tx}`
        : `Refused: ${data.reason}. ${MEANING[data.reason ?? ""] ?? "Leave this for the owner."} No money moved. ${timing}\n${tx}`;
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "approval_status",
  {
    title: "Check a held payment",
    description:
      "Check a payment that pay held for the owner's approval: whether it is still waiting, was approved (and paid), was declined, or lapsed unanswered.",
    inputSchema: {
      requestId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe("The request id that pay returned."),
    },
  },
  async ({ requestId }) => {
    const r = await client.readContract({
      address: ADDRESSES.spendRouter,
      abi: spendRouterAbi,
      functionName: "getRequest",
      args: [requestId as Hex],
    });
    const nameOf = await merchantNames();
    const what = `$${Number(r.auth.amount) / 1e6} to ${nameOf.get(r.auth.merchant.toLowerCase()) ?? r.auth.merchant}`;
    const lapsed = Number(r.auth.deadline) * 1000 <= Date.now();
    const text =
      r.status === 0
        ? "No held payment has that id."
        : r.status === 2
          ? `Approved by the owner: ${what} was paid.`
          : r.status === 3
            ? `Declined: ${what} was not paid, and the refusal is on record.`
            : lapsed
              ? `Lapsed: the owner did not answer before the authorisation expired, so ${what} was not paid.`
              : `Still waiting for the owner to approve ${what} (${r.reason}).`;
    return { content: [{ type: "text", text }] };
  },
);

await server.connect(new StdioServerTransport());
