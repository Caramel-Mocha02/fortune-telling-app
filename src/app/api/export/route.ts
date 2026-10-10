import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { APP_SLUG } from "@/lib/brand";

/** 本人のデータの書き出し対象 (行レベルセキュリティにより本人の行だけが返る) */
const TABLES = [
  "birth_profiles",
  "questions",
  "predictions",
  "prediction_items",
  "prediction_snapshots",
  "baseline_items",
  "check_ins",
  "life_events",
  "outcomes",
  "feedback",
  "prediction_evaluations",
  "palm_readings",
  "prediction_views",
  "user_method_performance",
] as const;

/** 自分のデータをすべて JSON でダウンロードする (手相画像そのものは含まず、保存先のパスのみ) */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase が未設定です" }, { status: 503 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user_id: auth.claims.sub,
    note: "手相画像そのものは含みません (palm_readings.image_path は保存先のパスです)。",
  };
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) return NextResponse.json({ error: `${table} の読み込みに失敗しました: ${error.message}` }, { status: 500 });
    out[table] = data;
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${APP_SLUG}-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
