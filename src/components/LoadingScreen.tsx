// Shared route-level loading state (used by every route's loading.tsx so the
// three copies can't drift apart).
export default function LoadingScreen({
  emoji,
  message,
}: {
  emoji: string;
  message: string;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper">
      <span aria-hidden="true" className="animate-pulse text-7xl">
        {emoji}
      </span>
      <p className="text-2xl font-black text-ink-soft">{message}</p>
      <span role="status" className="sr-only">
        Loading
      </span>
    </main>
  );
}
