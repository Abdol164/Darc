"use client";

/**
 * Approvals — payments an agent asked for that its card would not allow on its own: over the
 * limit, off the merchant list, or not fitting the card's stated purpose. Each waits on-chain
 * until the owner approves it with their passkey or declines it.
 */
import Link from "next/link";
import { ApprovalInbox } from "@/components/approvals";
import { PushToggle } from "@/components/push-toggle";
import { Shell } from "@/components/shell";
import { Button, Empty, Notice, Panel } from "@/components/ui";
import { pieces as p } from "@/components/pieces";
import { listCards } from "@/lib/cards";
import { useOwner } from "@/lib/owner-context";

export default function ApprovalsPage() {
  const { owner, error } = useOwner();
  const cardIds = owner ? listCards(owner).map((c) => c.cardId) : [];

  if (!owner) {
    return (
      <Shell title="Approvals" subtitle="Sign in to see payments waiting for you.">
        <Panel>
          <Empty title="Not signed in">
            <Link href="/sign-in">
              <Button variant="primary">Sign in</Button>
            </Link>
          </Empty>
        </Panel>
      </Shell>
    );
  }

  return (
    <Shell
      title="Approvals"
      subtitle="When an agent asks for something its card would not allow, the payment waits here instead of failing. Approve it with your passkey, or decline it."
    >
      <div className={p.stack}>
        {error && (
          <Notice tone="error" title="That did not go through">
            {error}
          </Notice>
        )}
        <Panel title="Waiting for you">
          <ApprovalInbox cardIds={cardIds} />
        </Panel>
        <Panel
          title="On your phone"
          note="Get each request as a notification. Tapping it opens this page, and one Face ID or fingerprint approves it."
        >
          <PushToggle />
        </Panel>
      </div>
    </Shell>
  );
}
