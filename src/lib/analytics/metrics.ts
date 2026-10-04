/**
 * 予測性能の指標 (仕様 16 / 18 / 24 / 17)。
 *
 * - 性能の根拠にするのは、出来事を紐付けて本人が確認した評価 (user_confirmed) だけ
 * - サンプルが MIN_SAMPLES_FOR_SIGNAL 未満の指標は数値を出さない (仕様 22 / 34)
 * - 「〜%当たる」とは表示しない。あくまで過去の一致の割合 (仕様 35)
 */
import { evaluateMatch, type EvaluableItem, type EvaluableOutcome } from "@/lib/evaluation/evaluate";
import { evidenceLevel, MIN_SAMPLES_FOR_SIGNAL, type EvidenceLevel } from "@/lib/evaluation/performance";
import type { MethodId } from "@/lib/divination/types";
import type { Theme } from "@/lib/domain/taxonomy";
import type { EvaluatedItem } from "./types";

export type Horizon = "short" | "mid" | "long";
export const HORIZON_LABELS: Record<Horizon, string> = { short: "短期 (〜3か月)", mid: "中期 (〜1年)", long: "長期 (1年超)" };

/** SQL の refresh_method_performance と同じ区切り */
export function horizonOf(periodDays: number): Horizon {
  return periodDays <= 100 ? "short" : periodDays <= 400 ? "mid" : "long";
}

export interface MetricSummary {
  n: number;
  level: EvidenceLevel;
  /** 以下は level が insufficient のとき null */
  timing_within_rate: number | null;
  theme_match_rate: number | null;
  event_match_rate: number | null;
  direction_match_rate: number | null;
  mean_overall: number | null;
}

const rate = (xs: Array<number | null>, threshold: number) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length === 0 ? null : v.filter((x) => x >= threshold).length / v.length;
};
const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

export function confirmedOnly(rows: EvaluatedItem[]): EvaluatedItem[] {
  return rows.filter((r) => r.evaluation.evaluation_source === "user_confirmed");
}

export function summarize(rows: EvaluatedItem[]): MetricSummary {
  const n = rows.length;
  const level = evidenceLevel(n);
  if (n < MIN_SAMPLES_FOR_SIGNAL) {
    return { n, level, timing_within_rate: null, theme_match_rate: null, event_match_rate: null, direction_match_rate: null, mean_overall: null };
  }
  const e = rows.map((r) => r.evaluation);
  return {
    n,
    level,
    timing_within_rate: rate(e.map((x) => x.timing_score), 1),
    theme_match_rate: rate(e.map((x) => x.theme_score), 1),
    event_match_rate: rate(e.map((x) => x.event_score), 0.5),
    direction_match_rate: rate(e.map((x) => x.direction_score), 1),
    mean_overall: mean(e.map((x) => x.overall_score)),
  };
}

/** 占術 × テーマ × 時間軸 (仕様 18)。項目を支持した占術ごとに 1 サンプル */
export function byMethodThemeHorizon(rows: EvaluatedItem[]) {
  const groups = new Map<string, { method: MethodId; theme: Theme; horizon: Horizon; rows: EvaluatedItem[] }>();
  for (const r of confirmedOnly(rows)) {
    const horizon = horizonOf(r.period_days);
    for (const method of r.supporting_methods) {
      const key = `${method}|${r.theme}|${horizon}`;
      if (!groups.has(key)) groups.set(key, { method, theme: r.theme, horizon, rows: [] });
      groups.get(key)!.rows.push(r);
    }
  }
  return [...groups.values()]
    .map((g) => ({ method: g.method, theme: g.theme, horizon: g.horizon, ...summarize(g.rows) }))
    .sort((a, b) => b.n - a.n);
}

/** バージョン別の比較 (仕様 24: Model V1 vs V2) */
export function byVersion(rows: EvaluatedItem[], key: "prediction_model_version" | "routing_version" | "prompt_version") {
  const groups = new Map<string, EvaluatedItem[]>();
  for (const r of confirmedOnly(rows)) groups.set(r[key], [...(groups.get(r[key]) ?? []), r]);
  return [...groups.entries()].map(([version, rs]) => ({ version, ...summarize(rs) })).sort((a, b) => a.version.localeCompare(b.version));
}

/**
 * 偶然レベルのベースライン (仕様 17 の Baseline A に相当)。
 *
 * 評価済みの各予測項目を、本人が紐付けた出来事「以外」の記録済みの出来事すべてと機械的に照合し、
 * 平均一致度を求める。実際の照合結果がこれと変わらなければ、予測は偶然以上の情報を持っていない。
 * (紐付けは本人が選んでいるため実際の値は高く出やすい。その差は「偶然との差の上限」として読む)
 */
export function chanceBaseline(
  rows: EvaluatedItem[],
  outcomes: Array<EvaluableOutcome & { id: string }>,
): { pairs: number; actual: MetricSummary; chance_mean_overall: number | null; chance_event_match_rate: number | null; chance_timing_within_rate: number | null } {
  const confirmed = confirmedOnly(rows).filter((r) => r.evaluation.outcome_id !== null);
  const overall: number[] = [];
  const event: number[] = [];
  const timing: number[] = [];
  for (const r of confirmed) {
    const item: EvaluableItem = r;
    for (const o of outcomes) {
      if (o.id === r.evaluation.outcome_id) continue;
      const s = evaluateMatch(item, o);
      overall.push(s.overall_score);
      event.push(s.event_score);
      if (s.timing_score !== null) timing.push(s.timing_score);
    }
  }
  const enough = confirmed.length >= MIN_SAMPLES_FOR_SIGNAL && overall.length > 0;
  return {
    pairs: overall.length,
    actual: summarize(confirmed),
    chance_mean_overall: enough ? mean(overall) : null,
    chance_event_match_rate: enough ? rate(event, 0.5) : null,
    chance_timing_within_rate: enough ? rate(timing, 1) : null,
  };
}
