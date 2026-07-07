import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Lands here from the magic-link email. Handles both the PKCE (?code=) and
// token-hash (?token_hash=&type=) shapes Supabase can send.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/bookshelf", url.origin));
    }
    console.error("[auth/callback] code exchange failed:", error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL("/bookshelf", url.origin));
    }
    console.error("[auth/callback] otp verify failed:", error.message);
  }

  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
