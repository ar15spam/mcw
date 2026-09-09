import type { ProjectOperation, ProjectState } from "@/lib/model";

export type AgentSelection = {
  trackId: string | null;
  clipId: string | null;
  /** an explicit bar range the user highlighted on the timeline */
  barStart?: number | null;
  barEnd?: number | null;
  sectionId?: string | null;
};

export type AgentTurn = { role: "you" | "agent"; text: string };

export type AgentRequestBody = {
  message: string;
  project: ProjectState;
  selection: AgentSelection;
  history?: AgentTurn[];
};

/** A single human-readable thing the agent changed. */
export type AgentChange = {
  label: string; // "Hi-hats — more movement"
  detail?: string; // "4 → 9 hits"
  track?: string; // track id the change touched, for UI highlight
};

export type AgentSuccess = {
  ok: true;
  reply: string; // one short sentence
  operations: ProjectOperation[];
  changes: AgentChange[];
  /** the raw tool names the model picked, for debugging / telemetry */
  toolsUsed: string[];
};

export type AgentFailure = {
  ok: false;
  code:
    | "not_configured"
    | "no_access"
    | "invalid_request"
    | "provider_error"
    | "no_change"
    | "rate_limited";
  error: string;
};

export type AgentResult = AgentSuccess | AgentFailure;

// ---- provider adapter surface ---------------------------------------------

export type ToolSchema = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

export type ProviderToolCall = {
  name: string;
  input: Record<string, unknown>;
};

export type ProviderResponse = {
  text: string;
  toolCalls: ProviderToolCall[];
};

export type Provider = {
  id: "anthropic" | "openai";
  model: string;
  complete(input: {
    system: string;
    user: string;
    tools: ToolSchema[];
  }): Promise<ProviderResponse>;
};

// ---- executor surface ----------------------------------------------------

export type ExecutionOutput = {
  operations: ProjectOperation[];
  changes: AgentChange[];
  /** soft problems worth telling the user about, e.g. "no synth track to change" */
  notes: string[];
};
