import type { Provider, ProviderResponse, ToolSchema } from "@/lib/agent/types";
import { offlineIntent } from "@/lib/agent/offline";

/**
 * Provider-agnostic completion. The co-producer only needs
 * "given a system prompt, a user message and a tool catalog, return the
 * model's text + tool calls". Thin fetch adapters implement that for
 * Anthropic and OpenAI; an offline pattern-matcher is the no-key fallback.
 *
 * Wire real language understanding by setting exactly one of
 * ANTHROPIC_API_KEY / OPENAI_API_KEY (or force one with AGENT_PROVIDER).
 * Override the model with AGENT_MODEL. Disable the offline fallback with
 * AGENT_OFFLINE=0.
 */

export type AgentMode = "llm" | "offline" | "disabled";

export function agentMode(): AgentMode {
  if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) return "llm";
  if (process.env.AGENT_OFFLINE === "0") return "disabled";
  return "offline";
}

/** kept for the GET /api/agent probe */
export function agentConfigured(): boolean {
  return agentMode() !== "disabled";
}

export function getProvider(): Provider | null {
  const forced = process.env.AGENT_PROVIDER?.toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (forced === "anthropic" && anthropicKey) return anthropic(anthropicKey);
  if (forced === "openai" && openaiKey) return openai(openaiKey);
  if (anthropicKey) return anthropic(anthropicKey);
  if (openaiKey) return openai(openaiKey);

  if (process.env.AGENT_OFFLINE === "0") return null;
  return offline();
}

function offline(): Provider {
  return {
    id: "offline" as unknown as "anthropic",
    model: "offline-intent",
    async complete({ user }): Promise<ProviderResponse> {
      // `user` is "Current project:\n{...}\n\nRequest: <message>"
      const request = user.split("\nRequest: ").slice(1).join("\nRequest: ") || user;
      return offlineIntent(request);
    },
  };
}

const TIMEOUT_MS = 20_000;

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---- Anthropic Messages API --------------------------------------------------

function anthropic(apiKey: string): Provider {
  const model = process.env.AGENT_MODEL || "claude-sonnet-5";
  return {
    id: "anthropic",
    model,
    async complete({ system, user, tools }): Promise<ProviderResponse> {
      const res = await timedFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system,
          messages: [{ role: "user", content: user }],
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters,
          })),
          tool_choice: { type: "auto" },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new ProviderError(res.status, body || "Anthropic request failed");
      }

      const data = (await res.json()) as {
        content?: Array<
          | { type: "text"; text: string }
          | { type: "tool_use"; name: string; input: Record<string, unknown> }
        >;
      };

      const text = (data.content ?? [])
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();

      const toolCalls = (data.content ?? [])
        .filter(
          (b): b is { type: "tool_use"; name: string; input: Record<string, unknown> } =>
            b.type === "tool_use",
        )
        .map((b) => ({ name: b.name, input: b.input ?? {} }));

      return { text, toolCalls };
    },
  };
}

// ---- OpenAI Responses API --------------------------------------------------
// Uses /v1/responses (not chat/completions) so it works with reasoning models
// like gpt-5.x, which require the Responses API for function tools. Non-reasoning
// models work here too.

const REASONING_EFFORT = process.env.AGENT_REASONING_EFFORT || "low";
const REASONING_MODELS = /^(o[0-9]|gpt-5|gpt-6)/i;

function openai(apiKey: string): Provider {
  const model = process.env.AGENT_MODEL || "gpt-4o-mini";
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  return {
    id: "openai",
    model,
    async complete({ system, user, tools }): Promise<ProviderResponse> {
      const payload: Record<string, unknown> = {
        model,
        instructions: system,
        input: user,
        tools: tools.map((t) => ({
          type: "function",
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
        })),
        tool_choice: "auto",
        max_output_tokens: 3000,
      };
      if (REASONING_MODELS.test(model) && REASONING_EFFORT !== "off") {
        payload.reasoning = { effort: REASONING_EFFORT };
      }

      const res = await timedFetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new ProviderError(res.status, body || "OpenAI request failed");
      }

      const data = (await res.json()) as {
        output?: Array<{
          type: string;
          name?: string;
          arguments?: string;
          content?: Array<{ type: string; text?: string }>;
        }>;
        output_text?: string;
      };

      const items = data.output ?? [];

      const toolCalls = items
        .filter((item) => item.type === "function_call" && item.name)
        .map((item) => {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(item.arguments || "{}");
          } catch {
            input = {};
          }
          return { name: item.name as string, input };
        });

      const text =
        data.output_text?.trim() ||
        items
          .filter((item) => item.type === "message")
          .flatMap((item) => item.content ?? [])
          .filter((c) => c.type === "output_text" && c.text)
          .map((c) => c.text as string)
          .join(" ")
          .trim();

      return { text, toolCalls };
    },
  };
}

export class ProviderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ProviderError";
  }
}

// re-export so the route can reference the schema type
export type { ToolSchema };
