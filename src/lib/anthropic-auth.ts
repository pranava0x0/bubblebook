import Anthropic from "@anthropic-ai/sdk";

// Two ways to reach Claude, in priority order:
//   1. CLAUDE_CODE_OAUTH_TOKEN — a subscription token from `claude setup-token`.
//      Inference bills against your Claude Pro/Max plan, not API credits. This
//      is the "run it on my subscription" path; it needs the oauth beta header.
//   2. ANTHROPIC_API_KEY — normal pay-as-you-go API billing (for deploys).
export type CredentialChoice =
  | { kind: "subscription"; token: string }
  | { kind: "api"; key: string }
  | { kind: "none" };

// Pure so it can be unit-tested without touching the real environment.
export function chooseCredential(env: {
  CLAUDE_CODE_OAUTH_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
}): CredentialChoice {
  const token = env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  if (token) return { kind: "subscription", token };
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (key) return { kind: "api", key };
  return { kind: "none" };
}

export function credentialLabel(choice: CredentialChoice): string {
  switch (choice.kind) {
    case "subscription":
      return "Claude subscription (CLAUDE_CODE_OAUTH_TOKEN)";
    case "api":
      return "Anthropic API key";
    case "none":
      return "none";
  }
}

export class MissingCredentialError extends Error {
  constructor() {
    super(
      "No Claude credentials found. Run `claude setup-token` and put the value in " +
        ".env.local as CLAUDE_CODE_OAUTH_TOKEN to bill your Claude subscription, " +
        "or set ANTHROPIC_API_KEY.",
    );
    this.name = "MissingCredentialError";
  }
}

// Built per request so a token added to .env.local is picked up on the next
// call without a server restart, and a missing token fails this request loudly
// rather than at boot.
export function resolveAnthropicClient(): {
  client: Anthropic;
  choice: CredentialChoice;
} {
  const choice = chooseCredential({
    CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  });
  if (choice.kind === "none") {
    throw new MissingCredentialError();
  }
  if (choice.kind === "subscription") {
    return {
      client: new Anthropic({
        authToken: choice.token,
        // Subscription OAuth tokens are only accepted on /v1/messages with
        // this beta header (the same one Claude Code sends).
        defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
      }),
      choice,
    };
  }
  return { client: new Anthropic({ apiKey: choice.key }), choice };
}
