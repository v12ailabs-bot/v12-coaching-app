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

                             
                             
                              
 

                                        
               
                
                              
                    
                    
 

                                         
                     
                  
 

// Thrown (not returned) on failure, carrying enough for the caller to record
// it -- head_coach_recommendations has model/model_version/latency_ms
// columns precisely so a failure can still be attributed, and "make AI
// failure non-fatal to the core application" means the caller (a future
// HC-011 reasoning step) catches this and fails the task gracefully via the
// existing failTask(), rather than an unhandled exception taking down the
// request.
export class ModelAdapterError extends Error {
           model        ;
           latencyMs        ;
  constructor(message        , model        , latencyMs        ) {
    super(message);
    this.name = "ModelAdapterError";
    this.model = model;
    this.latencyMs = latencyMs;
  }
}

                               
                                
                         
                                                                                             
 

// Matches the model string already used by every existing AI function in
// api/_lib/anthropic.js -- not a Head Coach-specific choice, just staying
// consistent with what this app already runs elsewhere. Changing it is a
// separate decision, out of scope here.
const DEFAULT_MODEL = "claude-opus-4-8";

// A review can make two calls (one bounded retry) inside Vercel's 60s
// function cap (unraisable on Hobby; see api/_lib/anthropic.js). Abort each
// call at 28s so a slow model becomes a clean JSON error from our own catch
// block instead of Vercel's plain-text 504, which the browser can't parse.
const CALL_TIMEOUT_MS = 28000;

export class ClaudeAdapter                         {
           providerName = "anthropic";
           model        ;
          client           ;

  constructor(model         = DEFAULT_MODEL) {
    this.model = model;
    // maxRetries 0: the SDK's own retries would stack on top of the hard
    // wall-clock cutoff in complete() and could push the request past
    // Vercel's 60s function cap.
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  }

  async complete(prompt        , options                         = {})                                 {
    const start = Date.now();
    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens ?? 1000,
        ...(options.system ? { system: options.system } : {}),
        messages: [{ role: "user", content: prompt }],
      }, { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
      const latencyMs = Date.now() - start;
      const textBlock = message.content.find((b)                           => b.type === "text");
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
    } catch (e     ) {
      const latencyMs = Date.now() - start;
      const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError" || /abort|timed? ?out/i.test(e?.message ?? "");
      throw new ModelAdapterError(timedOut ? `Claude did not respond within ${CALL_TIMEOUT_MS / 1000}s` : (e?.message ?? String(e)), this.model, latencyMs);
    }
  }
}

export const headCoachModel               = new ClaudeAdapter();
