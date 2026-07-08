import { describe, expect, it } from "vitest";
import { extractJsonObject, systemPrompt, userPrompt } from "@/lib/generate-story";

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
