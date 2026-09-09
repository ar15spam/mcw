"use client";

import type { CoproducerMessage } from "@/hooks/useCoproducer";

type Props = {
  messages: CoproducerMessage[];
  suggestions: string[];
  configured: boolean | null;
  onAsk: (text: string) => void;
};

export default function AgentPanel({
  messages,
  suggestions,
  configured,
  onAsk,
}: Props) {
  const lastAgent = [...messages].reverse().find((m) => m.role === "agent");

  return (
    <div className="agentPanel">
      <p className="agentPanelIntro">
        Describe how you want the music to feel — the co-producer changes the
        actual project, and everyone in the room hears it.
      </p>

      <div className="agentPanelSuggest">
        {suggestions.map((s) => (
          <button key={s} onClick={() => onAsk(s)} disabled={configured === false}>
            {s}
          </button>
        ))}
      </div>

      {lastAgent && (
        <div className="agentPanelRecap">
          <span className="eyebrow">LAST CHANGE</span>
          <p>{lastAgent.text}</p>
          {lastAgent.changes && (
            <ul>
              {lastAgent.changes.map((c, i) => (
                <li key={i}>
                  <b>{c.label}</b>
                  {c.detail ? <span> · {c.detail}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {configured === false && (
        <p className="agentPanelNote">
          The co-producer needs a server API key. It ships disabled until you add
          one.
        </p>
      )}
    </div>
  );
}
