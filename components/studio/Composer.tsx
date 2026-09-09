"use client";

import { useEffect, useRef, useState } from "react";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import type {
  CoproducerMessage,
  CoproducerStatus,
} from "@/hooks/useCoproducer";

type Props = {
  messages: CoproducerMessage[];
  status: CoproducerStatus;
  configured: boolean | null;
  mode: "llm" | "offline" | "disabled" | null;
  suggestions: string[];
  disabled?: boolean;
  onAsk: (text: string) => void;
  onClear: () => void;
};

const STATUS_LABEL: Record<CoproducerStatus, string> = {
  idle: "",
  thinking: "Thinking…",
  applying: "Applying…",
};

export default function Composer({
  messages,
  status,
  configured,
  mode,
  suggestions,
  disabled,
  onAsk,
  onClear,
}: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const speech = useSpeechInput((text) => {
    setValue("");
    onAsk(text);
    setOpen(true);
  });

  const busy = status !== "idle";
  const expanded = open || messages.length > 0;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, status]);

  function submit() {
    const text = value.trim();
    if (!text || busy || disabled) return;
    setValue("");
    setOpen(true);
    onAsk(text);
  }

  return (
    <div className={`composer ${expanded ? "isExpanded" : ""}`}>
      {expanded && messages.length > 0 && (
        <div className="composerLog" ref={logRef}>
          <div className="composerLogHead">
            <span>Co-producer</span>
            <button onClick={onClear} aria-label="Clear conversation">
              Clear
            </button>
          </div>
          {messages.map((message) => (
            <div key={message.id} className={`composerMsg is-${message.role}`}>
              <span className="composerRole">
                {message.role === "you" ? "You" : "✦"}
              </span>
              <div>
                <p className={message.tone === "error" ? "isError" : ""}>
                  {message.text}
                </p>
                {message.changes && message.changes.length > 0 && (
                  <ul className="composerChanges">
                    {message.changes.map((change, i) => (
                      <li key={i}>
                        <b>{change.label}</b>
                        {change.detail ? <span>{change.detail}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="composerMsg is-agent">
              <span className="composerRole">✦</span>
              <p className="composerPending">{STATUS_LABEL[status]}</p>
            </div>
          )}
        </div>
      )}

      {expanded && !busy && value.trim() === "" && suggestions.length > 0 && (
        <div className="composerSuggest">
          {suggestions.slice(0, 5).map((s) => (
            <button key={s} onClick={() => onAsk(s)} disabled={disabled}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="composerBar"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="composerSpark" aria-hidden="true">
          ✦
        </span>
        <textarea
          ref={inputRef}
          rows={1}
          value={speech.listening ? speech.interim || "Listening…" : value}
          placeholder={
            configured === false
              ? "Co-producer is turned off"
              : "Ask MIDICOLLAB to change the music…"
          }
          disabled={busy || speech.listening}
          onFocus={() => setOpen(true)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape" && messages.length === 0) setOpen(false);
          }}
        />

        <div className="composerActions">
          {status !== "idle" && (
            <span className="composerStatus">{STATUS_LABEL[status]}</span>
          )}
          {speech.supported && (
            <button
              type="button"
              className={`composerMic ${speech.listening ? "isLive" : ""}`}
              onClick={speech.toggle}
              disabled={busy || disabled}
              aria-label={speech.listening ? "Stop listening" : "Speak to the co-producer"}
            >
              {speech.listening ? "●" : "🎤"}
            </button>
          )}
          <button
            type="submit"
            className="composerSend"
            disabled={busy || disabled || value.trim() === ""}
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      </form>

      {configured === false && expanded && (
        <p className="composerNote">
          Set <code>ANTHROPIC_API_KEY</code> or <code>OPENAI_API_KEY</code> on the
          server to enable the co-producer.
        </p>
      )}
      {mode === "offline" && expanded && messages.length === 0 && (
        <p className="composerNote">
          Offline mode — understands common requests. Add an API key for full
          language understanding.
        </p>
      )}
    </div>
  );
}
