"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { STORY_LIMITS, THEMES, TILE_COLORS } from "@/lib/constants";

type VaultCharacter = { id: string; name: string; emoji: string | null };

type Status = "picking" | "making" | "error";

const MAKING_MESSAGES = [
  "Mixing the colors…",
  "Painting the pictures…",
  "Stacking the pages…",
  "Almost ready…",
];

export default function CreateFlow({
  characters,
  friendsFailedToLoad,
}: {
  characters: VaultCharacter[];
  friendsFailedToLoad: boolean;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [themeKey, setThemeKey] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("picking");
  const [errorMessage, setErrorMessage] = useState("");
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (status !== "making") return;
    setMessageIndex(0);
    const timer = setInterval(() => {
      setMessageIndex((current) => Math.min(current + 1, MAKING_MESSAGES.length - 1));
    }, 3000);
    return () => clearInterval(timer);
  }, [status]);

  function toggleFriend(id: string) {
    setFriendIds((current) => {
      if (current.includes(id)) return current.filter((f) => f !== id);
      if (current.length >= STORY_LIMITS.maxFriends) return current;
      return [...current, id];
    });
  }

  const canGo = themeKey !== null || friendIds.length > 0;

  async function makeStory() {
    setStatus("making");
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          themeKey: themeKey ?? undefined,
          characterIds: friendIds.length > 0 ? friendIds : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        throw new Error(body.error ?? "Something went sideways.");
      }
      router.push(`/story/${body.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Something went sideways.");
      setStatus("error");
    }
  }

  if (status === "making") {
    return (
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-paper px-8 text-center">
        <motion.span
          aria-hidden="true"
          className="text-8xl"
          animate={reduceMotion ? undefined : { y: [0, -22, 0] }}
          transition={reduceMotion ? undefined : { duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
        >
          📖
        </motion.span>
        <p aria-live="polite" className="text-3xl font-black">
          {MAKING_MESSAGES[messageIndex]}
        </p>
        <p className="text-lg font-semibold text-ink-soft">
          Your book is on its way. This takes a little moment.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-6 rounded-[1.75rem] border-4 border-paper-deep bg-white px-6 py-10 text-center">
        <span aria-hidden="true" className="text-7xl">
          🫠
        </span>
        <h2 className="text-3xl font-black">Uh oh.</h2>
        <p className="text-lg font-semibold text-ink-soft">{errorMessage}</p>
        <button
          type="button"
          onClick={() => setStatus("picking")}
          className="chunk bg-coral px-8 py-4 text-2xl font-black text-white [--chunk-edge:var(--color-coral-deep)]"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <section aria-label="Story ideas">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          {THEMES.map((theme) => {
            const colors = TILE_COLORS[theme.color];
            const selected = themeKey === theme.key;
            return (
              <button
                key={theme.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setThemeKey(selected ? null : theme.key)}
                className={`chunk flex aspect-square flex-col items-center justify-center gap-2 ${colors.bg} ${colors.edge} ${colors.text} ${
                  selected ? "ring-8 ring-sky ring-offset-4 ring-offset-paper" : ""
                }`}
              >
                <span aria-hidden="true" className="text-6xl">
                  {theme.emoji}
                </span>
                <span className="text-2xl font-black">{theme.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Your friends">
        <h2 className="mb-1 text-3xl font-black">Bring a friend?</h2>
        <p className="mb-4 text-lg font-semibold text-ink-soft">
          Friends from your old stories. Up to {STORY_LIMITS.maxFriends}.
        </p>
        {friendsFailedToLoad ? (
          <p className="rounded-2xl bg-white p-4 text-lg font-bold text-coral">
            Your friends didn&apos;t load this time. You can still pick a story above.
          </p>
        ) : characters.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-lg font-semibold text-ink-soft">
            No friends saved yet. Make a story and its characters will move in here, ready
            for the next one.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {characters.map((character) => {
              const selected = friendIds.includes(character.id);
              return (
                <button
                  key={character.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleFriend(character.id)}
                  className={`chunk flex aspect-square flex-col items-center justify-center gap-2 bg-white [--chunk-edge:var(--color-paper-deep)] ${
                    selected ? "ring-8 ring-sky ring-offset-4 ring-offset-paper" : ""
                  }`}
                >
                  <span aria-hidden="true" className="text-6xl">
                    {character.emoji ?? "⭐"}
                  </span>
                  <span className="line-clamp-1 px-2 text-xl font-black">{character.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-paper via-paper to-transparent px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8">
        <div className="mx-auto w-full max-w-3xl">
          <button
            type="button"
            disabled={!canGo}
            onClick={makeStory}
            className="chunk w-full bg-grass py-5 text-3xl font-black text-white [--chunk-edge:var(--color-grass-deep)] disabled:opacity-40"
          >
            Make my story!
          </button>
        </div>
      </div>
    </div>
  );
}
