import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CreateFlow from "./CreateFlow";

export default async function CreatePage() {
  const supabase = await createClient();
  const { data: characters, error } = await supabase
    .from("characters")
    .select("id,name,emoji")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[create] loading characters failed:", error.message);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-40 pt-6">
      <header className="mb-8 flex items-center gap-4">
        <Link
          href="/bookshelf"
          aria-label="Back to my books"
          className="chunk flex h-14 w-14 items-center justify-center bg-white [--chunk-edge:var(--color-paper-deep)]"
        >
          <ArrowLeft size={28} strokeWidth={2.75} aria-hidden="true" />
        </Link>
        <h1 className="text-4xl font-black tracking-tight">Pick a story!</h1>
      </header>

      <CreateFlow characters={characters ?? []} friendsFailedToLoad={Boolean(error)} />
    </main>
  );
}
