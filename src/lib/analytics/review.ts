/**
 * 月次レビュー (仕様 33) と年次レビュー (仕様 34)。
 * 十分なサンプルがない指標は出さず、データ不足のテーマ・占術として列挙する。
 */
import { THEMES, type Theme } from "@/lib/domain/taxonomy";
import type { MethodId } from "@/lib/divination/types";
import { MIN_SAMPLES_FOR_SIGNAL } from "@/lib/evaluation/performance";
import { confirmedOnly, summarize, type MetricSummary } from "./metrics";
import type { ReviewInput } from "./types";

export interface ReviewRange {
  start: string; // YYYY-MM-DD (含む)
  end: string; // YYYY-MM-DD (含む)
}

export function monthRange(year: number, month: number): ReviewRange {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

export function yearRange(year: number): ReviewRange {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export interface Review {
  range: ReviewRange;
  predictions_made: number;
  items_made: number;
  outcomes_recorded: number;
  /** 期間内に予測期間が重なっていた項目の回答状況 */
  verification: { match: number; partial: number; mismatch: number; unevaluated: number };
  /** 期間内に評価された項目の指標 (n < 10 なら数値なし) */
  metrics: MetricSummary;
  /** 期間内に評価された項目で、一致・類似の割合が高かったもの (n >= 10 のみ) */
  best_theme: { theme: Theme; event_match_rate: number; n: number } | null;
  best_method: { method: MethodId; event_match_rate: number; n: number } | null;
  /** 評価済みが 10 件未満のテーマ (仕様 34「データ不足」) */
  insufficient_themes: Theme[];
}

const within = (d: string, r: ReviewRange) => d.slice(0, 10) >= r.start && d.slice(0, 10) <= r.end;
const overlaps = (s: string, e: string, r: ReviewRange) => s <= r.end && e >= r.start;

function best<K extends string>(groups: Map<K, number[]>) {
  let top: { key: K; rate: number; n: number } | null = null;
  for (const [key, scores] of groups) {
    if (scores.length < MIN_SAMPLES_FOR_SIGNAL) continue;
    const r = scores.filter((s) => s >= 0.5).length / scores.length;
    if (!top || r > top.rate) top = { key, rate: r, n: scores.length };
  }
  return top;
}

export function buildReview(input: ReviewInput, range: ReviewRange): Review {
  const predictionIds = new Set(input.predictions.filter((p) => within(p.created_at, range)).map((p) => p.id));
  const items = input.items.filter((i) => overlaps(i.start_date, i.end_date, range));

  const verification = { match: 0, partial: 0, mismatch: 0, unevaluated: 0 };
  for (const i of items) {
    const v = input.verdicts[i.id];
    if (v === "occurred") verification.match++;
    else if (v === "partially" || v === "similar") verification.partial++;
    else if (v === "not_occurred") verification.mismatch++;
    else verification.unevaluated++;
  }

  const evaluated = confirmedOnly(input.evaluated).filter((e) => within(e.evaluation.evaluated_at, range));
  const themeScores = new Map<Theme, number[]>();
  const methodScores = new Map<MethodId, number[]>();
  for (const e of evaluated) {
    themeScores.set(e.theme, [...(themeScores.get(e.theme) ?? []), e.evaluation.event_score]);
    for (const m of e.supporting_methods) methodScores.set(m, [...(methodScores.get(m) ?? []), e.evaluation.event_score]);
  }
  const bt = best(themeScores);
  const bm = best(methodScores);

  // データ不足: 累計の評価件数で判定する (その期間だけでなく、それまでの蓄積)
  const cumulative = new Map<Theme, number>();
  for (const e of confirmedOnly(input.evaluated)) {
    if (e.evaluation.evaluated_at.slice(0, 10) <= range.end) cumulative.set(e.theme, (cumulative.get(e.theme) ?? 0) + 1);
  }
  const askedThemes = new Set(input.items.map((i) => i.theme));

  return {
    range,
    predictions_made: predictionIds.size,
    items_made: input.items.filter((i) => predictionIds.has(i.prediction_id)).length,
    outcomes_recorded: input.outcomes.filter((o) => within(o.occurred_at, range)).length,
    verification,
    metrics: summarize(evaluated),
    best_theme: bt ? { theme: bt.key, event_match_rate: bt.rate, n: bt.n } : null,
    best_method: bm ? { method: bm.key, event_match_rate: bm.rate, n: bm.n } : null,
    insufficient_themes: THEMES.filter((t) => askedThemes.has(t) && (cumulative.get(t) ?? 0) < MIN_SAMPLES_FOR_SIGNAL),
  };
}
