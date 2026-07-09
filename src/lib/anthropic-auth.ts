// Two ways to reach Claude, in priority order:
//   1. CLAUDE_CODE_OAUTH_TOKEN — a subscription token from `claude setup-token`.
//      Inference bills against your Claude Pro/Max plan. These tokens are only
//      accepted through the Claude Code CLI's own request path (a raw
//      /v1/messages call is soft-blocked with a bare 429), so the subscription
//      backend shells out to the `claude` CLI — see generate-story.ts.
//   2. ANTHROPIC_API_KEY — normal pay-as-you-go API billing (for deploys),
//      used via the official SDK.
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
// Resolved per request so a credential added to .env.local is picked up on the
// next call without a server restart, and a missing one fails this request
// loudly rather than at boot.
export function resolveCredential(): Exclude<CredentialChoice, { kind: "none" }> {
  const choice = chooseCredential({
    CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  });
  if (choice.kind === "none") {
    throw new MissingCredentialError();
  }
  return choice;
}
