/**
 * 本物の予測とベースライン予測を、同じ自動照合の手順で採点して比べる (仕様 17)。
 *
 * 確認済みの実績 (metrics.ts) はユーザーが選んだ出来事で採点するため、本物の予測に有利になる。
 * ここでは本物・ベースラインのどちらも「期間 (± 許容幅) 内に記録されたすべての出来事のうち最も一致したもの」で
 * 機械的に採点し、手順の差による有利不利をなくす。期間が終わっていない項目は採点しない。
 * この採点は比較専用で、占術別の実績には混ぜない。
 */
import { evaluateMatch, timingTolerance, type EvaluableItem, type EvaluableOutcome } from "@/lib/evaluation/evaluate";
import { MIN_SAMPLES_FOR_SIGNAL } from "@/lib/evaluation/performance";
import { addDays, formatIsoDate, parseIsoDate } from "@/lib/time/zoned";

export type ComparisonGroup = "model" | "history" | "prior";
export const COMPARISON_LABELS: Record<ComparisonGroup, string> = {
  model: "占術による予測",
  history: "Baseline B: 過去のライフログのみ",
  prior: "Baseline C: 年齢・季節のみ",
};

/** 期間終了後の自動採点。終わっていなければ null */
export function autoScore(item: EvaluableItem, outcomes: EvaluableOutcome[], today: string): { overall: number; event_hit: boolean } | null {
  if (today <= item.end_date) return null;
  const tol = timingTolerance(item);
  const from = formatIsoDate(addDays(parseIsoDate(item.start_date), -tol));
  const to = formatIsoDate(addDays(parseIsoDate(item.end_date), tol));
  let best = { overall: 0, event_hit: false };
  for (const o of outcomes) {
    if (o.occurred_at < from || o.occurred_at > to) continue;
    const s = evaluateMatch(item, o);
    if (s.overall_score > best.overall) best = { overall: s.overall_score, event_hit: s.event_score >= 0.5 };
  }
  return best;
}

export interface GroupResult {
  group: ComparisonGroup;
  n: number;
  mean_overall: number | null;
  event_hit_rate: number | null;
}

export function compareWithBaselines(
  groups: Record<ComparisonGroup, EvaluableItem[]>,
  outcomes: EvaluableOutcome[],
  today: string,
): { sufficient: boolean; results: GroupResult[] } {
  const results = (Object.keys(groups) as ComparisonGroup[]).map((group) => {
    const scores = groups[group].map((i) => autoScore(i, outcomes, today)).filter((s) => s !== null);
    const n = scores.length;
    const show = n >= MIN_SAMPLES_FOR_SIGNAL;
    return {
      group,
      n,
      mean_overall: show ? scores.reduce((a, s) => a + s.overall, 0) / n : null,
      event_hit_rate: show ? scores.filter((s) => s.event_hit).length / n : null,
    };
  });
  return { sufficient: results.find((r) => r.group === "model")!.n >= MIN_SAMPLES_FOR_SIGNAL, results };
}
