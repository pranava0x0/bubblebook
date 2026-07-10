import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { resolveCredential } from "@/lib/anthropic-auth";
import { STORY_MODEL } from "@/lib/constants";

// One text-in / text-out call to Claude, over whichever credential is
// configured. Story writing and illustration both go through here.
export type ClaudeAsk = {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
};

// API-key path: the official SDK against /v1/messages.
async function textFromSdk(key: string, ask: ClaudeAsk): Promise<string> {
  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create(
    {
      model: STORY_MODEL,
      max_tokens: ask.maxTokens,
      system: ask.system,
      messages: [{ role: "user", content: ask.user }],
    },
    { timeout: ask.timeoutMs },
  );
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// Build the child env for the subscription CLI. Crucially, DROP any
// ANTHROPIC_API_KEY: if the CLI sees one it can bill pay-as-you-go API credits
// instead of the subscription — silently defeating the whole reason this path
// exists. Pass only the OAuth token. Exported for a regression test.
export function cliSpawnEnv(
  baseEnv: Record<string, string | undefined>,
  token: string,
): Record<string, string | undefined> {
  const { ANTHROPIC_API_KEY: _dropped, ...rest } = baseEnv;
  void _dropped;
  return { ...rest, CLAUDE_CODE_OAUTH_TOKEN: token };
}

// Subscription path: shell out to the Claude Code CLI. A subscription OAuth
// token only authenticates through the CLI's own request path — a raw
// /v1/messages call with the same token is soft-blocked with a bare 429.
// --output-format json wraps the model's answer in an envelope; our rules are
// appended to (not replacing) the CLI's own system prompt so the subscription
// auth the API validates stays intact. The CLI has no max-tokens flag, so
// ask.maxTokens only bounds the SDK path.
async function textFromCli(token: string, ask: ClaudeAsk): Promise<string> {
  const bin = process.env.CLAUDE_CLI_BIN || "claude";
  const args = [
    "--print",
    ask.user,
    "--model",
    STORY_MODEL,
    "--output-format",
    "json",
    "--append-system-prompt",
    ask.system,
  ];

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, {
      env: cliSpawnEnv(process.env, token) as NodeJS.ProcessEnv,
      timeout: ask.timeoutMs,
      // The prompt goes in argv, so there is nothing to pipe. Left open, the
      // CLI blocks three seconds waiting for stdin that never comes.
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", (error) =>
      reject(
        new Error(
          `could not run the claude CLI (${bin}): ${error.message}. Set CLAUDE_CLI_BIN to its absolute path.`,
        ),
      ),
    );
    // A timeout kills the child with SIGTERM. Node reports that as signal
    // "SIGTERM" with a null code, but the CLI traps it and exits 143 (128+15)
    // instead — so both spellings mean "timed out", and neither should surface
    // as the opaque "exited 143".
    child.on("close", (code, signal) => {
      if (code === 0) resolve(out);
      else if (signal === "SIGTERM" || code === 143)
        reject(new Error(`claude CLI timed out after ${ask.timeoutMs / 1000}s`));
      else reject(new Error(`claude CLI exited ${code ?? signal}: ${err.slice(0, 300)}`));
    });
  });

  let envelope: { result?: unknown; is_error?: boolean; api_error_status?: number };
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new Error(`claude CLI returned non-JSON output: ${stdout.slice(0, 200)}`);
  }
  if (envelope.is_error) {
    throw new Error(
      `claude CLI reported an error (status ${envelope.api_error_status ?? "?"}): ${String(
        envelope.result,
      ).slice(0, 200)}`,
    );
  }
  return String(envelope.result ?? "");
}

export async function askClaude(ask: ClaudeAsk): Promise<string> {
  const choice = resolveCredential();
  return choice.kind === "subscription"
    ? textFromCli(choice.token, ask)
    : textFromSdk(choice.key, ask);
}

// Whether a Claude credential exists at all, for picking a default image
// provider without throwing when none is configured.
export function hasClaudeCredential(): boolean {
  try {
    resolveCredential();
    return true;
  } catch {
    return false;
  }
}
