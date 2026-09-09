import type { ProjectState } from "@/lib/model";
import { AGENT_SYSTEM_PROMPT, buildProjectSummary } from "@/lib/agent/context";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { executeToolCalls } from "@/lib/agent/executor";
import { agentMode, getProvider, ProviderError } from "@/lib/agent/providers";
import type { AgentResult, AgentSelection, AgentTurn } from "@/lib/agent/types";

export type { AgentResult, AgentSelection, AgentTurn } from "@/lib/agent/types";
export { agentConfigured, agentMode } from "@/lib/agent/providers";

function summarize(reply: string, changeCount: number): string {
  const trimmed = reply.trim().replace(/\s+/g, " ");
  if (trimmed) return trimmed.length > 200 ? `${trimmed.slice(0, 197)}…` : trimmed;
  if (changeCount === 0) return "Nothing to change there.";
  return `Done — ${changeCount} change${changeCount === 1 ? "" : "s"}.`;
}

export async function runAgent(input: {
  message: string;
  project: ProjectState;
  selection: AgentSelection;
  history?: AgentTurn[];
}): Promise<AgentResult> {
  const provider = getProvider();
  const mode = agentMode();
  if (!provider) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "The co-producer is turned off. Set an ANTHROPIC_API_KEY or OPENAI_API_KEY, or remove AGENT_OFFLINE=0.",
    };
  }

  const message = input.message.trim().slice(0, 600);
  if (!message) {
    return { ok: false, code: "invalid_request", error: "Say something first." };
  }

  const summary = buildProjectSummary(input.project, input.selection);

  const historyBlock = (input.history ?? [])
    .slice(-6)
    .map((turn) => `${turn.role === "you" ? "User" : "You"}: ${turn.text.slice(0, 200)}`)
    .join("\n");

  const user = [
    `Current project:\n${JSON.stringify(summary, null, 1)}`,
    historyBlock ? `Recent conversation:\n${historyBlock}` : "",
    `Request: ${message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let response;
  try {
    response = await provider.complete({
      system: AGENT_SYSTEM_PROMPT,
      user,
      tools: AGENT_TOOLS,
    });
  } catch (error) {
    if (error instanceof ProviderError && error.status === 429) {
      return {
        ok: false,
        code: "rate_limited",
        error: "The co-producer is busy — try again in a moment.",
      };
    }
    return {
      ok: false,
      code: "provider_error",
      error: "The co-producer couldn't respond just now.",
    };
  }

  const { operations, changes, notes } = executeToolCalls(
    response.toolCalls,
    input.project,
    input.selection,
  );

  if (operations.length === 0) {
    // The model may have just answered a question ("what does BPM mean?").
    const reply = response.text.trim();
    if (reply) {
      return { ok: true, reply, operations: [], changes: [], toolsUsed: [] };
    }
    return {
      ok: false,
      code: "no_change",
      error:
        notes[0] ??
        (mode === "offline"
          ? "I couldn't match that offline. Try “make it darker”, “add a bassline”, “less busy”, or add an API key for full understanding."
          : "I couldn't turn that into a change. Try describing the sound or feeling you want."),
    };
  }

  const reply =
    summarize(response.text, changes.length) +
    (notes.length ? ` (${notes.join(" ")})` : "");

  return {
    ok: true,
    reply,
    operations,
    changes,
    toolsUsed: response.toolCalls.map((c) => c.name),
  };
}
