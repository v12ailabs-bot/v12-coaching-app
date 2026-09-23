import Anthropic from "@anthropic-ai/sdk";

// HC-010 Claude Adapter -- a provider-neutral Head Coach model interface.
// Claude is the only implementation here, but nothing in ModelAdapter's
// shape is Claude-specific; a future provider would just implement the same
// interface. This is a SEPARATE module from api/_lib/anthropic.js on
// purpose -- that file's functions (generateGoalInsight,
// generatePhaseRecommendation, generateRoadmap, etc.) are existing,
// unrelated features and are left untouched; nothing here changes their
// behavior. The frontend never imports anything under api/_lib/, so "the
// frontend must never call Claude directly for coaching decisions" holds by
// construction, not by a runtime check.
//
// Not wired into any Head Coach flow yet -- there is no real prompt to send
// (that's HC-011, the Prompt Architecture / REVIEW_CHECK_IN prompt). Wiring
// this in before a real prompt exists would mean burning real API calls on
// placeholder text every time a coach clicks a button.

export interface ModelUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface ModelCompletionResult {
  text: string;
  model: string;
  modelVersion: string | null;
  usage: ModelUsage;
  latencyMs: number;
}

export interface ModelCompletionOptions {
  maxTokens?: number;
  system?: string;
}

// Thrown (not returned) on failure, carrying enough for the caller to record
// it -- head_coach_recommendations has model/model_version/latency_ms
// columns precisely so a failure can still be attributed, and "make AI
// failure non-fatal to the core application" means the caller (a future
// HC-011 reasoning step) catches this and fails the task gracefully via the
// existing failTask(), rather than an unhandled exception taking down the
// request.
export class ModelAdapterError extends Error {
  readonly model: string;
  readonly latencyMs: number;
  constructor(message: string, model: string, latencyMs: number) {
    super(message);
    this.name = "ModelAdapterError";
    this.model = model;
    this.latencyMs = latencyMs;
  }
}

export interface ModelAdapter {
  readonly providerName: string;
  readonly model: string;
  complete(prompt: string, options?: ModelCompletionOptions): Promise<ModelCompletionResult>;
}

// Matches the model string already used by every existing AI function in
// api/_lib/anthropic.js -- not a Head Coach-specific choice, just staying
// consistent with what this app already runs elsewhere. Changing it is a
// separate decision, out of scope here.
const DEFAULT_MODEL = "claude-opus-4-8";

export class ClaudeAdapter implements ModelAdapter {
  readonly providerName = "anthropic";
  readonly model: string;
  private client: Anthropic;

  constructor(model: string = DEFAULT_MODEL) {
    this.model = model;
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async complete(prompt: string, options: ModelCompletionOptions = {}): Promise<ModelCompletionResult> {
    const start = Date.now();
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens ?? 1000,
        ...(options.system ? { system: options.system } : {}),
        messages: [{ role: "user", content: prompt }],
      });
      const latencyMs = Date.now() - start;
      const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      return {
        text: (textBlock?.text ?? "").trim(),
        model: message.model,
        // Anthropic's API doesn't expose a version distinct from the model
        // string itself (unlike, say, a provider with separate model+build
        // identifiers) -- the model string IS the version here.
        modelVersion: message.model,
        usage: {
          inputTokens: message.usage?.input_tokens ?? null,
          outputTokens: message.usage?.output_tokens ?? null,
        },
        latencyMs,
      };
    } catch (e: any) {
      const latencyMs = Date.now() - start;
      throw new ModelAdapterError(e?.message ?? String(e), this.model, latencyMs);
    }
  }
}

export const headCoachModel: ModelAdapter = new ClaudeAdapter();
