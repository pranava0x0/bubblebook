import { NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_AGE_MONTHS, STORAGE_BUCKET, STORY_LIMITS, THEMES } from "@/lib/constants";
import { generateStory } from "@/lib/generate-story";
import { makePageImage } from "@/lib/images";
import { createAuthedClient, createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
// The subscription path shells out to the Claude CLI (cold start + generation);
// real image providers add ~10s per page on top.
export const maxDuration = 120;

const requestSchema = z
  .object({
    themeKey: z.string().optional(),
    characterIds: z.array(z.string().uuid()).max(STORY_LIMITS.maxFriends).optional(),
  })
  .refine((body) => body.themeKey || (body.characterIds && body.characterIds.length > 0), {
    message: "Pick a theme or at least one friend",
  });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // getUser() validated the session; getSession() gives us its access token so
  // storage uploads and inserts carry the user's JWT (the cookie client doesn't
  // attach it to storage — see createAuthedClient).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const authed = createAuthedClient(session.access_token);

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick a theme or a friend first" }, { status: 400 });
  }
  const { themeKey, characterIds } = parsed.data;

  const theme = themeKey ? THEMES.find((t) => t.key === themeKey) : undefined;
  if (themeKey && !theme) {
    return NextResponse.json({ error: "Unknown theme" }, { status: 400 });
  }

  // RLS scopes this select to the signed-in owner, so a foreign id comes back
  // missing rather than leaking someone else's character.
  let friends: Array<{ id: string; name: string; look: string }> = [];
  if (characterIds && characterIds.length > 0) {
    const { data, error } = await supabase
      .from("characters")
      .select("id,name,look")
      .in("id", characterIds);
    if (error) {
      console.error("[stories] loading friends failed:", error.message);
      return NextResponse.json({ error: "Couldn't load your friends" }, { status: 500 });
    }
    friends = data ?? [];
    if (friends.length !== characterIds.length) {
      return NextResponse.json({ error: "Friend not found" }, { status: 400 });
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("default_age_months")
    .eq("id", user.id)
    .single();
  if (profileError) {
    console.error("[stories] profile load failed, using default age:", profileError.message);
  }
  const ageMonths = profile?.default_age_months ?? DEFAULT_AGE_MONTHS;

  const friendNames = friends.map((f) => f.name).join(" and ");
  const description = theme
    ? friends.length > 0
      ? `${theme.seed}, together with ${friendNames}`
      : theme.seed
    : `${friendNames} having a tiny adventure`;

  let story;
  try {
    story = await generateStory({ description, friends, ageMonths });
  } catch (error) {
    console.error("[stories] generation failed:", error);
    return NextResponse.json(
      { error: "The story didn't come out right. Try again!" },
      { status: 502 },
    );
  }

  const storyId = crypto.randomUUID();

  let pageImages;
  try {
    pageImages = await Promise.all(
      story.pages.map((page) => makePageImage({ prompt: page.imagePrompt, emoji: page.emoji })),
    );
  } catch (error) {
    console.error("[stories] image generation failed:", error);
    return NextResponse.json(
      { error: "The pictures didn't come out right. Try again!" },
      { status: 502 },
    );
  }

  const imagePaths: string[] = [];
  // Storage and Postgres can't share one transaction, so any DB failure after
  // an upload would orphan the uploaded objects (they accumulate across every
  // failed retry). Remove them on every failure path.
  const cleanupImages = async () => {
    if (imagePaths.length === 0) return;
    const { error } = await authed.storage.from(STORAGE_BUCKET).remove(imagePaths);
    if (error) console.error("[stories] failed to remove orphaned images:", error.message);
  };

  for (const [index, image] of pageImages.entries()) {
    const path = `${user.id}/${storyId}/page-${index + 1}.${image.ext}`;
    // NO `upsert` — it makes Storage additionally evaluate the UPDATE policy,
    // which fails RLS on a brand-new object (a 403 that reads like an auth
    // failure but isn't). Paths are unique per story, so a plain insert is
    // correct. `authed` carries the user's JWT so RLS sees the owner.
    const { error } = await authed.storage
      .from(STORAGE_BUCKET)
      .upload(path, image.bytes, { contentType: image.contentType });
    if (error) {
      console.error(`[stories] upload failed for page ${index + 1}:`, error.message);
      await cleanupImages();
      return NextResponse.json({ error: "Couldn't save the pictures. Try again!" }, { status: 500 });
    }
    imagePaths.push(path);
  }

  const { error: storyError } = await authed.from("stories").insert({
    id: storyId,
    owner_id: user.id,
    title: story.title,
    seed: theme?.label ?? friendNames,
    status: "ready",
    target_age_months: ageMonths,
    cover_image_path: imagePaths[0],
  });
  if (storyError) {
    console.error("[stories] story insert failed:", storyError.message);
    await cleanupImages();
    return NextResponse.json({ error: "Couldn't save the story. Try again!" }, { status: 500 });
  }

  const { error: pagesError } = await authed.from("pages").insert(
    story.pages.map((page, index) => ({
      story_id: storyId,
      page_number: index + 1,
      text: page.text,
      image_prompt: page.imagePrompt,
      image_path: imagePaths[index],
    })),
  );
  if (pagesError) {
    console.error("[stories] pages insert failed:", pagesError.message);
    // Don't leave a pageless shell on the shelf. RLS can make a DELETE a silent
    // 0-row no-op, so check that the row actually went before trusting it.
    const { error: delError, count } = await authed
      .from("stories")
      .delete({ count: "exact" })
      .eq("id", storyId);
    if (delError || !count) {
      console.error(
        "[stories] compensating story delete did not remove the row:",
        delError?.message ?? `rows affected: ${count ?? 0}`,
      );
    }
    await cleanupImages();
    return NextResponse.json({ error: "Couldn't bind the book. Try again!" }, { status: 500 });
  }

  // Character vault: save this story's characters for future summoning.
  // A failure here is logged but never loses the finished story.
  try {
    const upsertRows = story.characters.map((c) => ({
      owner_id: user.id,
      name: c.name.trim(),
      look: c.look.trim(),
      emoji: c.emoji.trim() || null,
    }));
    const { error: upsertError } = await authed
      .from("characters")
      .upsert(upsertRows, { onConflict: "owner_id,name_key", ignoreDuplicates: true });
    if (upsertError) throw new Error(upsertError.message);

    const nameKeys = [...new Set(upsertRows.map((row) => row.name.toLowerCase()))];
    const { data: saved, error: selectError } = await authed
      .from("characters")
      .select("id")
      .eq("owner_id", user.id)
      .in("name_key", nameKeys);
    if (selectError) throw new Error(selectError.message);

    const linkIds = new Set([...(saved ?? []).map((c) => c.id), ...friends.map((f) => f.id)]);
    if (linkIds.size > 0) {
      const { error: linkError } = await authed.from("story_characters").upsert(
        [...linkIds].map((characterId) => ({ story_id: storyId, character_id: characterId })),
        { onConflict: "story_id,character_id", ignoreDuplicates: true },
      );
      if (linkError) throw new Error(linkError.message);
    }
  } catch (error) {
    console.error("[stories] character vault update failed (story is saved):", error);
  }

  return NextResponse.json({ id: storyId });
}
