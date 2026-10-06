"use client";

/**
 * The two rules beyond limits, as form fields: what the card is for (checked against every
 * payment, which is held for the owner when it does not fit) and how fast the agent may try
 * to pay (a burst over it freezes the card on-chain). Shared by the issue and edit forms.
 */
import { Button } from "./ui";
import { pieces as p } from "./pieces";

/** The velocity window. One minute keeps the rule easy to state: "N attempts a minute". */
export const BURST_WINDOW_S = 60;
const BURST_CHOICES = [0, 3, 5, 10] as const;

export const DEFAULT_PURPOSE = "Keep the team's infrastructure paid: hosting and API credits.";

export function RuleFields({
  purpose,
  onPurpose,
  burst,
  onBurst,
}: {
  purpose: string;
  onPurpose: (value: string) => void;
  burst: number;
  onBurst: (value: number) => void;
}) {
  return (
    <>
      <label className={p.field}>
        <span className={p.fieldLabel}>
          <span>What the card is for</span>
        </span>
        <textarea
          className={p.textarea}
          rows={2}
          maxLength={200}
          value={purpose}
          onChange={(e) => onPurpose(e.target.value)}
          placeholder={DEFAULT_PURPOSE}
        />
        <span className={p.fieldHint}>A payment that does not fit this waits for your approval instead of going through.</span>
      </label>
      <div className={p.field}>
        <span className={p.fieldLabel}>
          <span>Freeze on a burst</span>
          <span>{burst ? `more than ${burst} attempts a minute` : "off"}</span>
        </span>
        <div className={p.btnRow}>
          {BURST_CHOICES.map((n) => (
            <Button key={n} variant={burst === n ? "secondary" : "ghost"} onClick={() => onBurst(n)}>
              {n === 0 ? "Off" : `${n} a minute`}
            </Button>
          ))}
        </div>
        <span className={p.fieldHint}>Catches a runaway loop: the chain freezes the card until you unfreeze it.</span>
      </div>
    </>
  );
}
