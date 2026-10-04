/**
 * 成功指標 (仕様 56)。
 *
 * Primary:   予測の答え合わせ率 / 評価カバレッジ / 予測性能が時間とともに改善しているか
 * Secondary: 月間予測数・ライフログ数 / 答え合わせ率 (リマインド) / 継続 / 再予測率 / 過去予測参照率
 */
import { MIN_SAMPLES_FOR_SIGNAL } from "@/lib/evaluation/performance";
import { confirmedOnly, summarize, type MetricSummary } from "./metrics";
import type { EvaluatedItem } from "./types";

export interface KpiInput {
  predictions: Array<{ id: string; created_at: string; parent_prediction_id: string | null }>;
  items: Array<{ id: string; prediction_id: string; end_date: string }>;
  feedback: Array<{ prediction_item_id: string; verdict: string; created_at: string }>;
  evaluated: EvaluatedItem[];
  checkIns: Array<{ prediction_id: string; due_on: string; completed_at: string | null }>;
  outcomes: Array<{ recorded_at: string }>;
  views: Array<{ prediction_id: string; viewed_at: string }>;
}

export interface Ratio {
  numerator: number;
  denominator: number;
  rate: number | null;
}

const ratio = (numerator: number, denominator: number): Ratio => ({
  numerator,
  denominator,
  rate: denominator === 0 ? null : numerator / denominator,
});

const monthOf = (iso: string) => iso.slice(0, 7);

/** today を含む直近 count か月 (古い順, YYYY-MM) */
export function recentMonths(today: string, count: number): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function quarterOf(iso: string): string {
  return `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
}

export interface Trend {
  quarters: Array<{ quarter: string } & MetricSummary>;
  /** 十分なデータのある直近 2 四半期の比較。参考値 */
  direction: "improved" | "declined" | "flat" | "insufficient";
}

/** 予測を作った四半期ごとの一致 (確認済み評価のみ) */
export function performanceTrend(evaluated: EvaluatedItem[]): Trend {
  const groups = new Map<string, EvaluatedItem[]>();
  for (const r of confirmedOnly(evaluated)) {
    const q = quarterOf(r.prediction_created_at);
    groups.set(q, [...(groups.get(q) ?? []), r]);
  }
  const quarters = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([quarter, rs]) => ({ quarter, ...summarize(rs) }));
  const usable = quarters.filter((q) => q.n >= MIN_SAMPLES_FOR_SIGNAL && q.event_match_rate !== null);
  if (usable.length < 2) return { quarters, direction: "insufficient" };
  const [prev, last] = usable.slice(-2);
  const diff = last.event_match_rate! - prev.event_match_rate!;
  return { quarters, direction: Math.abs(diff) < 0.05 ? "flat" : diff > 0 ? "improved" : "declined" };
}

export interface Kpis {
  verification_rate: Ratio;
  evaluation_coverage: Ratio;
  trend: Trend;
  check_in_rate: Ratio;
  reforecast_rate: Ratio;
  reference_rate: Ratio;
  monthly: Array<{ month: string; predictions: number; outcomes: number; active: boolean }>;
  active_months: Ratio;
}

export function computeKpis(input: KpiInput, today: string): Kpis {
  // 答え合わせ率: 確認時期が来た予測の項目のうち、「まだ分からない」以外で回答されたもの
  const dueIds = new Set(input.checkIns.filter((c) => c.due_on <= today).map((c) => c.prediction_id));
  const dueItems = input.items.filter((i) => dueIds.has(i.prediction_id));
  const answered = new Set(input.feedback.filter((f) => f.verdict !== "pending").map((f) => f.prediction_item_id));

  // 評価カバレッジ: 期間が終わった項目のうち、評価レコードがあるもの
  const ended = input.items.filter((i) => i.end_date < today);
  const evaluatedIds = new Set(input.evaluated.map((e) => e.item_id));

  const dueCheckIns = input.checkIns.filter((c) => c.due_on <= today);

  // 過去予測参照率: 作成から 1 日以上経った予測のうち、その後に開かれたもの
  const dayAfter = (iso: string) => new Date(new Date(iso).getTime() + 86400_000).toISOString();
  const old = input.predictions.filter((p) => dayAfter(p.created_at).slice(0, 10) <= today);
  const revisited = old.filter((p) => input.views.some((v) => v.prediction_id === p.id && v.viewed_at >= dayAfter(p.created_at)));

  const months = recentMonths(today, 6);
  const monthly = months.map((month) => {
    const predictions = input.predictions.filter((p) => monthOf(p.created_at) === month).length;
    const outcomes = input.outcomes.filter((o) => monthOf(o.recorded_at) === month).length;
    const answeredInMonth = input.feedback.some((f) => monthOf(f.created_at) === month);
    return { month, predictions, outcomes, active: predictions + outcomes > 0 || answeredInMonth };
  });

  return {
    verification_rate: ratio(dueItems.filter((i) => answered.has(i.id)).length, dueItems.length),
    evaluation_coverage: ratio(ended.filter((i) => evaluatedIds.has(i.id)).length, ended.length),
    trend: performanceTrend(input.evaluated),
    check_in_rate: ratio(dueCheckIns.filter((c) => c.completed_at !== null).length, dueCheckIns.length),
    reforecast_rate: ratio(input.predictions.filter((p) => p.parent_prediction_id !== null).length, input.predictions.length),
    reference_rate: ratio(revisited.length, old.length),
    monthly,
    active_months: ratio(monthly.filter((m) => m.active).length, monthly.length),
  };
}
