"use client";

// Route-level error boundary: an unexpected throw anywhere in the app lands
// here on-brand instead of on Next's raw error page. `reset` re-renders the
// segment; the Home link is the always-safe escape hatch.
import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error:", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-8 text-center">
      <span aria-hidden="true" className="text-8xl">
        🫠
      </span>
      <h1 className="text-4xl font-black">Oops!</h1>
      <p className="text-xl font-semibold text-ink-soft">
        Something wobbled. Let&apos;s try that again.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="chunk bg-coral px-8 py-4 text-2xl font-black text-white [--chunk-edge:var(--color-coral-deep)]"
        >
          Try again
        </button>
        <Link
          href="/bookshelf"
          className="chunk bg-white px-8 py-4 text-2xl font-black [--chunk-edge:var(--color-paper-deep)]"
        >
          My books
        </Link>
      </div>
    </main>
  );
}
