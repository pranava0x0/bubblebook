"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Home, RotateCcw } from "lucide-react";

export type ReaderPage = {
  text: string;
  alt: string;
  imageUrl: string | null;
};

const SWIPE_THRESHOLD = 80;

// Past this, a dot per page stops fitting between the two 56px header buttons
// on a 375px screen. Longer books get a count instead.
const MAX_DOTS = 8;

export default function Reader({ title, pages }: { title: string; pages: ReaderPage[] }) {
  // index runs 0..pages.length; the final index is the "The End" card.
  const [[index, direction], setPage] = useState<[number, number]>([0, 1]);
  const reduceMotion = useReducedMotion();
  const endIndex = pages.length;

  // Page 1 renders in place (no entrance slide): the SSR HTML would otherwise
  // carry an offscreen transform until hydration. Turns after that animate.
  const firstRender = useRef(true);
  useEffect(() => {
    firstRender.current = false;
  }, []);

  // Arrow keys turn pages for a grown-up reading on a laptop. endIndex is stable
  // (pages never changes), so the functional updater needs no other deps.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") setPage(([current]) => [Math.min(current + 1, endIndex), 1]);
      else if (event.key === "ArrowLeft") setPage(([current]) => [Math.max(current - 1, 0), -1]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [endIndex]);

  function go(delta: number) {
    setPage(([current]) => {
      const next = Math.min(Math.max(current + delta, 0), endIndex);
      return [next, delta];
    });
  }

  const page = index < endIndex ? pages[index] : null;

  return (
    <main className="fixed inset-0 flex flex-col bg-paper">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-3">
        <Link
          href="/bookshelf"
          aria-label="Back to my books"
          className="chunk flex h-14 w-14 items-center justify-center bg-white [--chunk-edge:var(--color-paper-deep)]"
        >
          <Home size={28} strokeWidth={2.75} aria-hidden="true" />
        </Link>
        {pages.length <= MAX_DOTS ? (
          <div aria-hidden="true" className="flex items-center gap-2">
            {pages.map((_, dot) => (
              <span
                key={dot}
                className={`h-3.5 w-3.5 rounded-full transition-transform ${
                  dot === index ? "scale-125 bg-coral" : "bg-ink/20"
                }`}
              />
            ))}
          </div>
        ) : (
          <span
            aria-hidden="true"
            className="rounded-full bg-white px-4 py-1.5 text-xl font-black tabular-nums text-ink-soft"
          >
            {Math.min(index + 1, pages.length)}/{pages.length}
          </span>
        )}
        <span className="sr-only" aria-live="polite">
          {index < endIndex ? `Page ${index + 1} of ${pages.length}` : "The end"}
        </span>
        <span className="h-14 w-14" aria-hidden="true" />
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* No exit animations on purpose: toddlers mash the arrows faster than
            a page turn settles, and interrupted AnimatePresence exits stall
            with ghost pages stuck mid-transition. A keyed remount that slides
            the new page in over an instant unmount can't be wedged — exactly
            one page exists at any moment. The slide is a tween, not a spring:
            a long spring tail left a page frozen mid-slide when a viewport
            resize (tablet rotation) landed during the animation; 280ms keeps
            that window tiny and stays inside the motion budget. */}
        <motion.section
            key={index}
            {...(firstRender.current
              ? { initial: false as const }
              : reduceMotion
                ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
                : {
                    // Both endpoints in percent: mixing "100%" with a numeric
                    // 0 forces framer's DOM-measuring unit conversion, a
                    // fragile path under throttled rAF (backgrounded tabs).
                    initial: { x: direction > 0 ? "100%" : "-100%" },
                    animate: { x: "0%" },
                  })}
            transition={
              reduceMotion ? { duration: 0.15 } : { duration: 0.28, ease: "easeOut" }
            }
            drag={reduceMotion ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.x < -SWIPE_THRESHOLD && index < endIndex) go(1);
              else if (info.offset.x > SWIPE_THRESHOLD && index > 0) go(-1);
            }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 pb-32 pt-20"
          >
            {page ? (
              <>
                <div className="flex min-h-0 w-full max-w-2xl flex-1 items-center justify-center">
                  {page.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={page.imageUrl}
                      alt={page.alt}
                      draggable={false}
                      className="max-h-full w-auto max-w-full rounded-[2rem] border-8 border-white shadow-[0_8px_0_var(--color-paper-deep)]"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="flex aspect-square max-h-full items-center justify-center rounded-[2rem] border-8 border-white bg-paper-deep text-9xl"
                    >
                      📖
                    </div>
                  )}
                </div>
                {/* Sized for the long case (two sentences); a three-word
                    refrain page still reads huge because the line is short. */}
                <p className="max-w-2xl text-balance text-center text-[clamp(1.5rem,4.5vw,2.75rem)] font-black leading-tight">
                  {page.text}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-6 text-center">
                <span aria-hidden="true" className="text-8xl">
                  🎉
                </span>
                <h1 className="text-4xl font-black">{title}</h1>
                <p className="text-2xl font-bold text-ink-soft">The end!</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setPage([0, -1])}
                    className="chunk flex items-center gap-3 bg-sky px-8 py-4 text-2xl font-black text-white [--chunk-edge:var(--color-sky-deep)]"
                  >
                    <RotateCcw size={28} strokeWidth={3} aria-hidden="true" />
                    Read again
                  </button>
                  <Link
                    href="/bookshelf"
                    className="chunk flex items-center gap-3 bg-coral px-8 py-4 text-2xl font-black text-white [--chunk-edge:var(--color-coral-deep)]"
                  >
                    All done
                  </Link>
                </div>
              </div>
            )}
        </motion.section>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Previous page"
          className="chunk flex h-20 w-24 items-center justify-center bg-sunshine [--chunk-edge:var(--color-sunshine-deep)] disabled:opacity-30"
        >
          <ArrowLeft size={44} strokeWidth={3} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index === endIndex}
          aria-label="Next page"
          className="chunk flex h-20 w-24 items-center justify-center bg-grass text-white [--chunk-edge:var(--color-grass-deep)] disabled:opacity-30"
        >
          <ArrowRight size={44} strokeWidth={3} aria-hidden="true" />
        </button>
      </div>
    </main>
  );
}
