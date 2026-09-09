"use client";

import { useEffect, useState } from "react";

const SCRIPT = [
  {
    prompt: "make it more electric",
    changes: [
      { track: "Synth", note: "brighter, more movement" },
      { track: "Hi-hats", note: "busier pattern" },
      { track: "Tempo", note: "124 → 128 BPM" },
    ],
  },
  {
    prompt: "give it a 2am feel",
    changes: [
      { track: "Drums", note: "stripped back, hypnotic" },
      { track: "Bass", note: "deep, offbeat" },
      { track: "Synth", note: "darker, spacious" },
    ],
  },
  {
    prompt: "add a bassline",
    changes: [
      { track: "Bass", note: "new track" },
      { track: "Pattern", note: "driving, in key" },
    ],
  },
  {
    prompt: "make the drums bounce",
    changes: [
      { track: "Drums", note: "garage groove, swung" },
      { track: "Kick", note: "syncopated" },
    ],
  },
];

export default function CoproducerDemo() {
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "thinking" | "done">("typing");

  useEffect(() => {
    const scene = SCRIPT[step];
    let raf = 0;
    let i = 0;
    setTyped("");
    setPhase("typing");

    const tick = () => {
      i += 1;
      setTyped(scene.prompt.slice(0, i));
      if (i < scene.prompt.length) {
        raf = window.setTimeout(tick, 55);
      } else {
        raf = window.setTimeout(() => setPhase("thinking"), 500);
      }
    };
    raf = window.setTimeout(tick, 400);
    return () => window.clearTimeout(raf);
  }, [step]);

  useEffect(() => {
    if (phase === "thinking") {
      const t = window.setTimeout(() => setPhase("done"), 900);
      return () => window.clearTimeout(t);
    }
    if (phase === "done") {
      const t = window.setTimeout(
        () => setStep((s) => (s + 1) % SCRIPT.length),
        3200,
      );
      return () => window.clearTimeout(t);
    }
  }, [phase]);

  const scene = SCRIPT[step];

  return (
    <div className="coDemo">
      <div className="coDemoBar">
        <span className="coDemoSpark">✦</span>
        <span className="coDemoInput">
          {typed}
          <span className="coDemoCaret" />
        </span>
      </div>

      <div className={`coDemoOut phase-${phase}`}>
        {phase === "thinking" && <span className="coDemoThinking">Thinking…</span>}
        {phase === "done" && (
          <>
            <span className="coDemoReply">✦ {scene.changes.length} changes</span>
            <ul>
              {scene.changes.map((c, i) => (
                <li key={i} style={{ animationDelay: `${i * 80}ms` }}>
                  <b>{c.track}</b>
                  <span>{c.note}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
