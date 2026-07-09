import { describe, expect, it, vi } from "vitest";
import {
  cliSpawnEnv,
  extractJsonObject,
  generateFromText,
  systemPrompt,
  userPrompt,
} from "@/lib/generate-story";

// A story that passes storySchema: 3 pages, 2-5 words each, 1 character.
const VALID_STORY =
  '{"title":"Little Duck","pages":[' +
  '{"text":"Duck goes splash!","imagePrompt":"a small yellow duck splashing","emoji":"🦆"},' +
  '{"text":"Duck hops high!","imagePrompt":"a small yellow duck hopping","emoji":"🦆"},' +
  '{"text":"Sleepy Duck naps.","imagePrompt":"a small yellow duck sleeping","emoji":"😴"}],' +
  '"characters":[{"name":"Duck","look":"a small yellow duck","emoji":"🦆"}]}';
const INVALID_STORY = '{"title":"x","pages":[],"characters":[]}';

describe("extractJsonObject", () => {
  it("returns bare JSON unchanged", () => {
    const json = '{"title":"Duck"}';
    expect(extractJsonObject(json)).toBe(json);
  });

  it("strips a markdown fence and surrounding prose", () => {
    const text = 'Here you go:\n```json\n{"title":"Duck"}\n```\nEnjoy!';
    expect(extractJsonObject(text)).toBe('{"title":"Duck"}');
  });

  it("handles nested objects and braces inside strings", () => {
    const json = '{"a":{"b":1},"note":"a } brace in a string"}';
    expect(extractJsonObject(`prefix ${json} suffix`)).toBe(json);
  });

  it("handles an escaped quote before a closing brace", () => {
    const json = '{"t":"she said \\"hi\\""}';
    expect(extractJsonObject(json)).toBe(json);
  });

  it("returns null when there is no object", () => {
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });

  it("returns null for an unbalanced object", () => {
    expect(extractJsonObject('{"title":"Duck"')).toBeNull();
  });
});

describe("prompts", () => {
  it("system prompt states the JSON shape and word limits", () => {
    const p = systemPrompt(24);
    expect(p).toContain("JSON object");
    expect(p).toContain("imagePrompt");
    expect(p).toMatch(/2 to 5 words/);
  });

  it("user prompt lists friends when present", () => {
    const p = userPrompt({
      description: "a duck",
      friends: [{ name: "Ducky", look: "yellow duck" }],
      ageMonths: 24,
    });
    expect(p).toContain("Ducky");
    expect(p).toContain("yellow duck");
  });

  it("user prompt omits the friends line when there are none", () => {
    const p = userPrompt({ description: "a duck", friends: [], ageMonths: 24 });
    expect(p).not.toContain("familiar friends");
  });
});

describe("authoring brief", () => {
  it("asks for a repeating refrain and reuse of the character's name", () => {
    const p = systemPrompt(24);
    expect(p).toMatch(/refrain/i);
    expect(p).toMatch(/USE THAT NAME/);
  });

  it("asks for a soothing close on sleepy themes", () => {
    expect(systemPrompt(24)).toMatch(/Goodnight|Sleep tight|calming/i);
  });

  it("makes a provided friend the star", () => {
    const p = userPrompt({
      description: "the moon",
      friends: [{ name: "Ducky", look: "yellow duck" }],
      ageMonths: 24,
    });
    expect(p).toMatch(/star/i);
    expect(p).toContain("Ducky");
  });
});

describe("cliSpawnEnv", () => {
  it("drops ANTHROPIC_API_KEY so the subscription CLI can't bill API credits", () => {
    const env = cliSpawnEnv({ ANTHROPIC_API_KEY: "sk-ant-xxx", PATH: "/bin" }, "oat-token");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oat-token");
    expect(env.PATH).toBe("/bin");
  });
});

describe("generateFromText retry policy", () => {
  it("returns the parsed story on valid output", async () => {
    const story = await generateFromText(async () => VALID_STORY);
    expect(story.title).toBe("Little Duck");
    expect(story.pages).toHaveLength(3);
  });

  it("retries once on invalid output, then succeeds", async () => {
    const getText = vi.fn().mockResolvedValueOnce(INVALID_STORY).mockResolvedValueOnce(VALID_STORY);
    const story = await generateFromText(getText);
    expect(getText).toHaveBeenCalledTimes(2);
    expect(story.title).toBe("Little Duck");
  });

  it("does NOT retry a transport failure — no double-spend", async () => {
    const getText = vi.fn().mockRejectedValue(new Error("claude CLI timed out after 60s"));
    await expect(generateFromText(getText)).rejects.toThrow("timed out");
    expect(getText).toHaveBeenCalledTimes(1);
  });

  it("throws after two invalid outputs", async () => {
    const getText = vi.fn().mockResolvedValue(INVALID_STORY);
    await expect(generateFromText(getText)).rejects.toBeTruthy();
    expect(getText).toHaveBeenCalledTimes(2);
  });
});
