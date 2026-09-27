import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const DEFAULT_SETTINGS = {
  enabled: false,
  keywords: [] as string[],
  search_type: "RECENT" as "TOP" | "RECENT",
  exclude_authors: [] as string[],
  judge_criteria: "",
  reply_tone: "親しみやすい",
  max_candidates_per_run: 10,
  auto_post: false,
};

export async function GET() {
  try {
    const supabaseAuth = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from("engagement_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("engagement settings fetch error:", error);

      return NextResponse.json(
        { error: "設定の取得に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      settings: data ?? { user_id: user.id, ...DEFAULT_SETTINGS },
    });
  } catch (error) {
    console.error("engagement settings GET error:", error);

    return NextResponse.json(
      { error: "設定の取得中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "ログインしてください。" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const keywords = Array.isArray(body.keywords)
      ? body.keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
      : DEFAULT_SETTINGS.keywords;

    const excludeAuthors = Array.isArray(body.exclude_authors)
      ? body.exclude_authors
          .map((a: unknown) => String(a).trim().replace(/^@/, ""))
          .filter(Boolean)
      : DEFAULT_SETTINGS.exclude_authors;

    const searchType = body.search_type === "TOP" ? "TOP" : "RECENT";

    const maxCandidates = Math.min(
      Math.max(Number(body.max_candidates_per_run) || 10, 1),
      30
    );

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from("engagement_settings")
      .upsert({
        user_id: user.id,
        enabled: Boolean(body.enabled),
        keywords,
        search_type: searchType,
        exclude_authors: excludeAuthors,
        judge_criteria:
          typeof body.judge_criteria === "string" ? body.judge_criteria : "",
        reply_tone:
          typeof body.reply_tone === "string" && body.reply_tone
            ? body.reply_tone
            : DEFAULT_SETTINGS.reply_tone,
        max_candidates_per_run: maxCandidates,
        auto_post: Boolean(body.auto_post),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("engagement settings upsert error:", error);

      return NextResponse.json(
        { error: "設定の保存に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, settings: data });
  } catch (error) {
    console.error("engagement settings POST error:", error);

    return NextResponse.json(
      { error: "設定の保存中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}