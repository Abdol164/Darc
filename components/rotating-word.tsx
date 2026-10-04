"use client";

/**
 * One word of a heading that cycles through a short list. Each new word rises into place;
 * with reduced motion it stays on the first. Screen readers get the first word only, so the
 * heading is not re-announced every few seconds.
 */
import { useEffect, useState } from "react";
import r from "./rotating-word.module.css";

export function RotatingWord({ words, interval = 2800 }: { words: readonly string[]; interval?: number }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [words.length, interval]);

  return (
    <span className={r.slot}>
      <span className={r.sr}>{words[0]}</span>
      <span key={i} className={r.word} aria-hidden>
        {words[i]}
      </span>
    </span>
  );
}
