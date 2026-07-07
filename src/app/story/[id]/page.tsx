import { notFound } from "next/navigation";
import { STORAGE_BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import Reader from "./Reader";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: story } = await supabase
    .from("stories")
    .select("id,title")
    .eq("id", id)
    .single();
  if (!story) {
    notFound();
  }

  const { data: pages, error } = await supabase
    .from("pages")
    .select("page_number,text,image_prompt,image_path")
    .eq("story_id", id)
    .order("page_number");
  if (error) {
    console.error("[story] loading pages failed:", error.message);
  }
  if (!pages || pages.length === 0) {
    notFound();
  }

  const readerPages = pages.map((page) => ({
    text: page.text,
    alt: page.image_prompt,
    imageUrl: page.image_path
      ? supabase.storage.from(STORAGE_BUCKET).getPublicUrl(page.image_path).data.publicUrl
      : null,
  }));

  return <Reader title={story.title} pages={readerPages} />;
}
