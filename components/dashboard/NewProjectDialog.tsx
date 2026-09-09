"use client";

import { useEffect, useState } from "react";

type Props = {
  onClose: () => void;
  onStart: (starter: string, describe?: string) => void;
  busy: boolean;
};

const VIBES = [
  { id: "dark", label: "Dark" },
  { id: "dreamy", label: "Dreamy" },
  { id: "electric", label: "Electric" },
  { id: "warm", label: "Warm" },
  { id: "bouncy", label: "Bouncy" },
  { id: "chill", label: "Chill" },
];

export default function NewProjectDialog({ onClose, onStart, busy }: Props) {
  const [text, setText] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="newProjectOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Start a project"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="newProjectDialog">
        <p className="eyebrow">NEW PROJECT</p>
        <h2>What do you want to make?</h2>
        <p className="newProjectSub">
          Pick a starting point — the co-producer sets up a beat, bass and sound
          to match. You can change everything after.
        </p>

        <div className="newProjectVibes">
          {VIBES.map((v) => (
            <button
              key={v.id}
              disabled={busy}
              onClick={() => onStart(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <form
          className="newProjectAsk"
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (t) onStart("describe", t);
          }}
        >
          <input
            autoFocus
            value={text}
            disabled={busy}
            placeholder="…or describe it: “something dark and futuristic”"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" disabled={busy || !text.trim()}>
            {busy ? "…" : "Make it"}
          </button>
        </form>

        <button
          className="newProjectBlank"
          disabled={busy}
          onClick={() => onStart("blank")}
        >
          Start from an empty project
        </button>
      </div>
    </div>
  );
}
