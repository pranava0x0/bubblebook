// Row shapes for the Supabase tables (see supabase/migrations/0001_init.sql).

export type StoryStatus = "generating" | "ready" | "failed";

export type StoryRow = {
  id: string;
  owner_id: string;
  title: string;
  seed: string;
  status: StoryStatus;
  target_age_months: number;
  cover_image_path: string | null;
  created_at: string;
};

export type PageRow = {
  id: string;
  story_id: string;
  page_number: number;
  text: string;
  image_prompt: string;
  image_path: string | null;
};

export type CharacterRow = {
  id: string;
  owner_id: string;
  name: string;
  name_key: string;
  look: string;
  emoji: string | null;
  image_path: string | null;
  created_at: string;
};
