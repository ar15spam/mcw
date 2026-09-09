"use client";

import { useState } from "react";

type Props = {
  onVibe: (mood: string) => void;
  onAsk: (text: string) => void;
  agentConfigured: boolean | null;
};

const VIBES = [
  { id: "dark", label: "Dark" },
  { id: "dreamy", label: "Dreamy" },
  { id: "electric", label: "Electric" },
  { id: "warm", label: "Warm" },
  { id: "bouncy", label: "Bouncy" },
  { id: "chill", label: "Chill" },
];

export default function StudioStarter({ onVibe, onAsk, agentConfigured }: Props) {
  const [text, setText] = useState("");

  return (
    <section className="studioStarter">
      <p className="studioStarterKicker">NOTHING PLAYING YET</p>
      <h2>What do you want to make?</h2>
      <p className="studioStarterSub">
        Pick a starting point — you can change everything after.
      </p>

      <div className="studioStarterVibes">
        {VIBES.map((v) => (
          <button key={v.id} onClick={() => onVibe(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {agentConfigured !== false && (
        <form
          className="studioStarterAsk"
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (t) {
              onAsk(t);
              setText("");
            }
          }}
        >
          <input
            value={text}
            placeholder="…or describe it: “something dark and futuristic”"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" disabled={!text.trim()}>
            Make it
          </button>
        </form>
      )}
    </section>
  );
}
