/**
 * Intent check: does this payment fit what the owner said the card is for?
 *
 * The owner writes a purpose in plain language ("hosting and API credits for the team"), and
 * it is stored on-chain with the card. Before Darc's relayer submits a payment that the card's
 * hard limits would allow, a small model reads the purpose and the request together. A payment
 * that does not fit is not refused: it is held for the owner to approve.
 *
 * This is judgement, so it lives off-chain and only ever ADDS a human check. The on-chain
 * limits still bound every payment whatever the model says.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const Verdict = z.object({
  fits: z.boolean(),
  /** One short sentence the owner sees next to the approval request. */
  reason: z.string(),
});

export type IntentVerdict = z.infer<typeof Verdict>;

const SYSTEM = `You review payments that an AI agent wants to make with a spending card. The card's owner wrote, in plain language, what the card is for. Decide whether this payment plausibly serves that purpose.

Be generous with ordinary purchases that relate to the purpose. Flag a payment when it is clearly unrelated to the purpose, or when it looks like the agent has drifted onto a different task. Do not judge the amount or the merchant list: the card's own limits enforce those.

Give your reason in one short, plain sentence written for the owner, under 20 words.`;

/** Whether intent checks can run here: they need an API key on the server. */
export const intentChecksEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

/**
 * Returns the model's verdict, or null when there is nothing to check (no stated purpose, no
 * API key) or the check itself failed. A failed check lets the payment continue: the hard
 * limits still apply, and an outage of the reviewer should not stop every agent.
 */
export async function checkIntent(request: {
  purpose: string;
  merchantName: string;
  merchantSells: string;
  amountUsd: number;
  memo?: string;
}): Promise<IntentVerdict | null> {
  if (!intentChecksEnabled() || !request.purpose.trim()) return null;

  const client = new Anthropic();
  try {
    const response = await client.messages.parse(
      {
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              `Card purpose: ${request.purpose.trim()}`,
              `Merchant: ${request.merchantName} (${request.merchantSells})`,
              `Amount: $${request.amountUsd}`,
              `What the agent says the payment is for: ${request.memo?.trim() || "not stated"}`,
            ].join("\n"),
          },
        ],
        output_config: { format: zodOutputFormat(Verdict) },
      },
      { timeout: 10_000 },
    );
    const verdict = response.parsed_output;
    // The callers end the sentence themselves.
    return verdict ? { ...verdict, reason: verdict.reason.trim().replace(/\.+$/, "") } : null;
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.error(`[intent] API error ${err.status}:`, err.message);
    else console.error("[intent]", err);
    return null;
  }
}
