"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectOperation } from "@/lib/model";
import type { AgentChange, AgentResult, AgentSelection } from "@/lib/agent/types";

export type CoproducerMessage = {
  id: string;
  role: "you" | "agent";
  text: string;
  changes?: AgentChange[];
  tone?: "normal" | "error";
};

export type CoproducerStatus = "idle" | "thinking" | "applying";

type Options = {
  projectId: string | null;
  getSelection: () => AgentSelection;
  applyOperations: (operations: ProjectOperation[]) => void;
  onActivity?: (trackIds: string[]) => void;
};

function id() {
  return Math.random().toString(36).slice(2);
}

export function useCoproducer({
  projectId,
  getSelection,
  applyOperations,
  onActivity,
}: Options) {
  const [messages, setMessages] = useState<CoproducerMessage[]>([]);
  const [status, setStatus] = useState<CoproducerStatus>("idle");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"llm" | "offline" | "disabled" | null>(null);
  const inFlight = useRef(false);

  const applyRef = useRef(applyOperations);
  const selectionRef = useRef(getSelection);
  const activityRef = useRef(onActivity);
  const messagesRef = useRef<CoproducerMessage[]>([]);
  useEffect(() => {
    applyRef.current = applyOperations;
    selectionRef.current = getSelection;
    activityRef.current = onActivity;
    messagesRef.current = messages;
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent", { cache: "no-store" })
      .then((r) => r.json())
      .then((body: { configured?: boolean; mode?: "llm" | "offline" | "disabled" }) => {
        if (cancelled) return;
        setConfigured(Boolean(body.configured));
        setMode(body.mode ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setConfigured(false);
          setMode("disabled");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const push = useCallback((message: Omit<CoproducerMessage, "id">) => {
    setMessages((prev) => [...prev, { ...message, id: id() }].slice(-24));
  }, []);

  const ask = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || !projectId || inFlight.current) return;

      inFlight.current = true;
      const history = messagesRef.current
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }));
      push({ role: "you", text });
      setStatus("thinking");

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId,
            message: text,
            selection: selectionRef.current(),
            history,
          }),
        });
        const result = (await res.json()) as AgentResult;

        if (!result.ok) {
          push({ role: "agent", text: result.error, tone: "error" });
          return;
        }

        if (result.operations.length > 0) {
          setStatus("applying");
          applyRef.current(result.operations);
          const trackIds = Array.from(
            new Set(
              result.changes
                .map((c) => c.track)
                .filter((t): t is string => Boolean(t)),
            ),
          );
          if (trackIds.length) activityRef.current?.(trackIds);
        }

        push({
          role: "agent",
          text: result.reply,
          changes: result.changes.length ? result.changes : undefined,
        });
      } catch {
        push({
          role: "agent",
          text: "Something went wrong reaching the co-producer.",
          tone: "error",
        });
      } finally {
        inFlight.current = false;
        setStatus("idle");
      }
    },
    [projectId, push],
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, status, configured, mode, ask, clear };
}
