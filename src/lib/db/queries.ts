import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import type { EvaluationRow, FeedbackRow } from "./types";
import { summarizeByTheme, type EvaluatedRow } from "@/lib/evaluation/performance";
import type { EvaluatedItem } from "@/lib/analytics/types";
import type { PerfCell } from "@/lib/routing/personalize";
import type { MethodId } from "@/lib/divination/types";
import type { Theme } from "@/lib/domain/taxonomy";
import { daysBetween, parseIsoDate } from "@/lib/time/zoned";

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

/** 評価済み予測項目 (項目ごとの最新評価) と予測のバージョン情報 */
export async function loadEvaluatedItems(supabase: Supabase): Promise<EvaluatedItem[]> {
  const { data, error } = await supabase
    .from("prediction_evaluations")
    .select(
      "prediction_item_id, outcome_id, timing_score, theme_score, event_score, direction_score, magnitude_score, overall_score, evaluation_source, evaluated_at, " +
        "prediction_items(prediction_id, theme, event_type, direction, magnitude, start_date, end_date, supporting_methods, " +
        "predictions(created_at, prediction_period_start, prediction_period_end, prediction_model_version, routing_version, prompt_version))",
    )
    .order("evaluated_at", { ascending: false });
  if (error) throw new Error(`評価の取得に失敗しました: ${error.message}`);

  const num = (x: unknown) => (x === null || x === undefined ? null : Number(x));
  const seen = new Set<string>();
  const rows: EvaluatedItem[] = [];
  for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const itemId = r.prediction_item_id as string;
    if (seen.has(itemId)) continue;
    seen.add(itemId);
    const item = r.prediction_items as Record<string, unknown> | null;
    const pred = item?.predictions as Record<string, string> | null;
    if (!item || !pred) continue;
    rows.push({
      item_id: itemId,
      prediction_id: item.prediction_id as string,
      theme: item.theme as EvaluatedItem["theme"],
      event_type: item.event_type as EvaluatedItem["event_type"],
      direction: item.direction as EvaluatedItem["direction"],
      magnitude: item.magnitude as EvaluatedItem["magnitude"],
      start_date: item.start_date as string,
      end_date: item.end_date as string,
      supporting_methods: item.supporting_methods as MethodId[],
      prediction_created_at: pred.created_at,
      period_days: daysBetween(parseIsoDate(pred.prediction_period_start), parseIsoDate(pred.prediction_period_end)),
      prediction_model_version: pred.prediction_model_version,
      routing_version: pred.routing_version,
      prompt_version: pred.prompt_version,
      evaluation: {
        outcome_id: (r.outcome_id as string | null) ?? null,
        timing_score: num(r.timing_score),
        theme_score: num(r.theme_score),
        event_score: Number(r.event_score),
        direction_score: num(r.direction_score),
        magnitude_score: num(r.magnitude_score),
        overall_score: Number(r.overall_score),
        evaluation_source: r.evaluation_source as EvaluatedItem["evaluation"]["evaluation_source"],
        evaluated_at: r.evaluated_at as string,
      },
    });
  }
  return rows;
}

/** 個人別ルーティング用: テーマに対する本人と全体の占術別実績 (全体は時間軸を合算) */
export async function loadMethodPerformance(supabase: Supabase, theme: Theme) {
  const [{ data: mine }, { data: all }] = await Promise.all([
    supabase.from("user_method_performance").select("method, sample_count, event_score, timing_score").eq("theme", theme),
    supabase.from("method_performance").select("method, sample_count, event_score, timing_score").eq("theme", theme),
  ]);
  const toCell = (n: number, e: unknown, t: unknown): PerfCell => ({
    n,
    event_score: e === null ? null : Number(e),
    timing_score: t === null ? null : Number(t),
  });
  const user: Partial<Record<MethodId, PerfCell>> = {};
  for (const r of mine ?? []) user[r.method as MethodId] = toCell(r.sample_count, r.event_score, r.timing_score);

  const global: Partial<Record<MethodId, PerfCell>> = {};
  for (const r of all ?? []) {
    const m = r.method as MethodId;
    const prev = global[m];
    const cell = toCell(r.sample_count, r.event_score, r.timing_score);
    if (!prev) {
      global[m] = cell;
      continue;
    }
    const n = prev.n + cell.n;
    const wavg = (a: number | null, b: number | null) =>
      a === null ? b : b === null ? a : (a * prev.n + b * cell.n) / n;
    global[m] = { n, event_score: wavg(prev.event_score, cell.event_score), timing_score: wavg(prev.timing_score, cell.timing_score) };
  }
  return { user, global };
}
