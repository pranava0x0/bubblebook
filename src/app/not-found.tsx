import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <span aria-hidden="true" className="text-8xl">
        🫧
      </span>
      <h1 className="text-4xl font-black">That page floated away.</h1>
      <Link
        href="/bookshelf"
        className="chunk bg-coral px-8 py-4 text-2xl font-black text-white [--chunk-edge:var(--color-coral-deep)]"
      >
        Back to my books
      </Link>
    </main>
  );
}
