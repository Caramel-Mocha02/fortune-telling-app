import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import type { EvaluationRow, FeedbackRow } from "./types";
import { summarizeByTheme, type EvaluatedRow } from "@/lib/evaluation/performance";

/** 予測項目ごとの最新の回答と評価 (追記型テーブルなので最新行が現在値) */
export async function latestVerdicts(supabase: Supabase, itemIds: string[]) {
  if (itemIds.length === 0) return { feedback: new Map<string, FeedbackRow>(), evaluations: new Map<string, EvaluationRow>() };
  const [{ data: fb }, { data: ev }] = await Promise.all([
    supabase.from("feedback").select("*").in("prediction_item_id", itemIds).order("created_at", { ascending: false }),
    supabase.from("prediction_evaluations").select("*").in("prediction_item_id", itemIds).order("evaluated_at", { ascending: false }),
  ]);
  const feedback = new Map<string, FeedbackRow>();
  for (const f of (fb ?? []) as FeedbackRow[]) if (!feedback.has(f.prediction_item_id)) feedback.set(f.prediction_item_id, f);
  const evaluations = new Map<string, EvaluationRow>();
  for (const e of (ev ?? []) as EvaluationRow[]) if (!evaluations.has(e.prediction_item_id)) evaluations.set(e.prediction_item_id, e);
  return { feedback, evaluations };
}

/** ユーザーの評価済み予測項目のテーマ別要約 */
export async function themePerformance(supabase: Supabase) {
  const { data } = await supabase
    .from("prediction_evaluations")
    .select("prediction_item_id, timing_score, theme_score, event_score, evaluated_at, prediction_items(theme)")
    .order("evaluated_at", { ascending: false });
  const seen = new Set<string>();
  const rows: EvaluatedRow[] = [];
  for (const r of data ?? []) {
    if (seen.has(r.prediction_item_id)) continue;
    seen.add(r.prediction_item_id);
    const item = r.prediction_items as unknown as { theme: EvaluatedRow["theme"] } | null;
    if (!item) continue;
    rows.push({
      theme: item.theme,
      timing_score: r.timing_score === null ? null : Number(r.timing_score),
      theme_score: r.theme_score === null ? null : Number(r.theme_score),
      event_score: Number(r.event_score),
    });
  }
  return summarizeByTheme(rows);
}
