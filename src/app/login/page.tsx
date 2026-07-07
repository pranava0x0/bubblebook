import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-10 px-6 py-12">
      <header className="flex flex-col items-center gap-3 text-center">
        <div aria-hidden="true" className="flex items-end gap-1 text-6xl">
          <span>🫧</span>
          <span className="text-4xl">🫧</span>
        </div>
        <h1 className="text-5xl font-black tracking-tight">Bubble Book</h1>
        <p className="text-lg font-semibold text-ink-soft">
          Little stories you make together.
        </p>
      </header>

      <LoginForm linkFailed={error === "link"} />

      <footer className="text-center text-sm font-semibold text-ink-soft">
        <a className="underline" href="https://pranavaraparla.com">
          pranavaraparla.com
        </a>{" "}
        ·{" "}
        <a className="underline" href="https://github.com/pranava0x0">
          source
        </a>
      </footer>
    </main>
  );
}
