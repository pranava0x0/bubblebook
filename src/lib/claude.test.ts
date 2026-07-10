import { describe, expect, it } from "vitest";
import { cliSpawnEnv } from "@/lib/claude";

describe("cliSpawnEnv", () => {
  it("drops ANTHROPIC_API_KEY so the subscription CLI can't bill API credits", () => {
    const env = cliSpawnEnv({ ANTHROPIC_API_KEY: "sk-ant-xxx", PATH: "/bin" }, "oat-token");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oat-token");
    expect(env.PATH).toBe("/bin");
  });
});
