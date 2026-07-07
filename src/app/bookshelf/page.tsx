import Link from "next/link";
import { Plus } from "lucide-react";
import { STORAGE_BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export default async function BookshelfPage() {
  const supabase = await createClient();
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id,title,seed,cover_image_path,created_at")
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[bookshelf] loading stories failed:", error.message);
  }

  const covers = (stories ?? []).map((story) => ({
    ...story,
    coverUrl: story.cover_image_path
      ? supabase.storage.from(STORAGE_BUCKET).getPublicUrl(story.cover_image_path).data.publicUrl
      : null,
  }));

  return (
    <main className="mx-auto w-full max-w-5xl px-5 pb-16 pt-8">
      <header className="mb-8 flex items-end justify-between">
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">My Books</h1>
        <span aria-hidden="true" className="text-4xl">
          📚
        </span>
      </header>

      {error ? (
        <p className="mb-6 rounded-2xl bg-white p-4 text-lg font-bold text-coral">
          The shelf wobbled and the books didn&apos;t load. Pull down to refresh, or try again
          in a moment.
        </p>
      ) : covers.length === 0 ? (
        <p className="mb-6 text-xl font-bold text-ink-soft">
          No books yet! Tap the yellow tile and make your first story.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        <Link
          href="/create"
          className="chunk flex aspect-[3/4] flex-col items-center justify-center gap-3 bg-sunshine [--chunk-edge:var(--color-sunshine-deep)]"
        >
          <Plus size={64} strokeWidth={3.5} aria-hidden="true" />
          <span className="text-2xl font-black">New Story</span>
        </Link>

        {covers.map((story) => (
          <Link key={story.id} href={`/story/${story.id}`} className="chunk block aspect-[3/4]">
            <article className="flex h-full flex-col overflow-hidden rounded-[inherit] border-4 border-white bg-white">
              {story.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={story.coverUrl}
                  alt=""
                  loading="lazy"
                  className="min-h-0 w-full flex-1 rounded-t-[1.4rem] object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex min-h-0 w-full flex-1 items-center justify-center rounded-t-[1.4rem] bg-paper-deep text-7xl"
                >
                  📖
                </div>
              )}
              <h2 className="line-clamp-2 px-3 py-3 text-center text-lg font-black leading-tight">
                {story.title}
              </h2>
            </article>
          </Link>
        ))}
      </div>

      <footer className="mt-14 flex items-center justify-between text-sm font-semibold text-ink-soft">
        <span>
          <a className="underline" href="https://pranavaraparla.com">
            pranavaraparla.com
          </a>{" "}
          ·{" "}
          <a className="underline" href="https://github.com/pranava0x0">
            source
          </a>
        </span>
        <form action="/auth/signout" method="post">
          <button type="submit" className="underline">
            Sign out
          </button>
        </form>
      </footer>
    </main>
  );
}
