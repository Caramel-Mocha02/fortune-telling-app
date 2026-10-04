/**
 * 予測評価エンジン (仕様 14 / 15)。
 *
 * 評価はすべて明文化されたルールで機械的に行い、AI に「当たったことにする」判断をさせない (仕様 54-⑥)。
 * 各軸のスコアは別々に保存する。overall_score は内部集計用で、的中確率としては表示しない (仕様 15 / 35)。
 */
import {
  EVENT_TYPES,
  MAGNITUDES,
  RELATED_THEMES,
  type Direction,
  type EventType,
  type Magnitude,
  type Theme,
  type Verdict,
} from "@/lib/domain/taxonomy";
import { daysBetween, parseIsoDate } from "@/lib/time/zoned";

export interface EvaluableItem {
  theme: Theme;
  event_type: EventType;
  direction: Direction;
  magnitude: Magnitude;
  start_date: string;
  end_date: string;
}

export interface EvaluableOutcome {
  occurred_at: string; // YYYY-MM-DD
  theme: Theme;
  event_type: EventType;
  direction: Direction;
  magnitude: Magnitude;
}

export type TimingLabel = "within" | "early_near" | "late_near" | "early_far" | "late_far";
export type ThemeLabel = "match" | "related" | "mismatch";
export type EventLabel = "match" | "similar" | "related" | "mismatch";
export type DirectionLabel = "match" | "neutral" | "opposite" | "unknown";
export type MagnitudeLabel = "match" | "overestimate" | "underestimate" | "unknown";

export interface EvaluationScores {
  timing_label: TimingLabel | null;
  timing_score: number | null;
  theme_label: ThemeLabel | null;
  theme_score: number | null;
  event_label: EventLabel;
  event_score: number;
  direction_label: DirectionLabel | null;
  direction_score: number | null;
  magnitude_label: MagnitudeLabel | null;
  magnitude_score: number | null;
  overall_score: number;
}

export const LABELS_JA = {
  timing: {
    within: "予測期間内",
    early_near: "やや早い",
    late_near: "やや遅い",
    early_far: "大幅に早い",
    late_far: "大幅に遅い",
  },
  theme: { match: "一致", related: "関連", mismatch: "不一致" },
  event: { match: "一致", similar: "類似イベント", related: "関連イベント", mismatch: "不一致" },
  direction: { match: "一致", neutral: "中立", opposite: "逆", unknown: "不明" },
  magnitude: { match: "一致", overestimate: "過大評価", underestimate: "過小評価", unknown: "不明" },
} as const;

const WEIGHTS = { timing: 0.25, theme: 0.15, event: 0.3, direction: 0.15, magnitude: 0.15 };

/** 期間外でも「近似」とみなす許容幅: 期間長の 25% と 30 日の大きい方 */
export function timingTolerance(item: Pick<EvaluableItem, "start_date" | "end_date">): number {
  return Math.max(30, daysBetween(parseIsoDate(item.start_date), parseIsoDate(item.end_date)) * 0.25);
}

export function scoreTiming(item: EvaluableItem, occurredAt: string): { label: TimingLabel; score: number } {
  const t = parseIsoDate(occurredAt);
  const start = parseIsoDate(item.start_date);
  const end = parseIsoDate(item.end_date);
  if (t >= start && t <= end) return { label: "within", score: 1 };
  const tol = timingTolerance(item);
  if (t < start) {
    return daysBetween(t, start) <= tol ? { label: "early_near", score: 0.5 } : { label: "early_far", score: 0 };
  }
  return daysBetween(end, t) <= tol ? { label: "late_near", score: 0.5 } : { label: "late_far", score: 0 };
}

export function scoreTheme(predicted: Theme, actual: Theme): { label: ThemeLabel; score: number } {
  if (predicted === actual) return { label: "match", score: 1 };
  if (RELATED_THEMES[predicted].includes(actual)) return { label: "related", score: 0.5 };
  return { label: "mismatch", score: 0 };
}

export function scoreEvent(item: EvaluableItem, outcome: EvaluableOutcome): { label: EventLabel; score: number } {
  if (item.event_type === outcome.event_type) return { label: "match", score: 1 };
  const pf = EVENT_TYPES[item.event_type].family;
  const of = EVENT_TYPES[outcome.event_type].family;
  if (pf === of && pf !== "general") return { label: "similar", score: 0.5 };
  // 「全般的な変化」の予測は、同テーマで何らかの出来事があれば類似とみなす
  if (pf === "general" && item.theme === outcome.theme) return { label: "similar", score: 0.5 };
  if (item.theme === outcome.theme) return { label: "related", score: 0.25 };
  return { label: "mismatch", score: 0 };
}

export function scoreDirection(predicted: Direction, actual: Direction): { label: DirectionLabel; score: number | null } {
  if (predicted === "unknown" || actual === "unknown") return { label: "unknown", score: null };
  if (predicted === actual) return { label: "match", score: 1 };
  const moving = (d: Direction) => d === "positive" || d === "negative" || d === "change";
  if (predicted === "change" && moving(actual)) return { label: "match", score: 1 };
  if ((predicted === "positive" && actual === "negative") || (predicted === "negative" && actual === "positive")) {
    return { label: "opposite", score: 0 };
  }
  if ((predicted === "stable" && moving(actual)) || (moving(predicted) && actual === "stable")) {
    return { label: "opposite", score: 0 };
  }
  return { label: "neutral", score: 0.5 };
}

export function scoreMagnitude(predicted: Magnitude, actual: Magnitude): { label: MagnitudeLabel; score: number } {
  const diff = MAGNITUDES.indexOf(predicted) - MAGNITUDES.indexOf(actual);
  if (diff === 0) return { label: "match", score: 1 };
  return { label: diff > 0 ? "overestimate" : "underestimate", score: 1 - 0.5 * Math.abs(diff) };
}

function weightedOverall(parts: Array<[keyof typeof WEIGHTS, number | null]>): number {
  let sum = 0;
  let w = 0;
  for (const [k, v] of parts) {
    if (v === null) continue;
    sum += v * WEIGHTS[k];
    w += WEIGHTS[k];
  }
  return w === 0 ? 0 : Math.round((sum / w) * 1000) / 1000;
}

/** 予測項目と現実の出来事を照合する */
export function evaluateMatch(item: EvaluableItem, outcome: EvaluableOutcome): EvaluationScores {
  const timing = scoreTiming(item, outcome.occurred_at);
  const theme = scoreTheme(item.theme, outcome.theme);
  const event = scoreEvent(item, outcome);
  const direction = scoreDirection(item.direction, outcome.direction);
  const magnitude = scoreMagnitude(item.magnitude, outcome.magnitude);
  return {
    timing_label: timing.label,
    timing_score: timing.score,
    theme_label: theme.label,
    theme_score: theme.score,
    event_label: event.label,
    event_score: event.score,
    direction_label: direction.label,
    direction_score: direction.score,
    magnitude_label: magnitude.label,
    magnitude_score: magnitude.score,
    overall_score: weightedOverall([
      ["timing", timing.score],
      ["theme", theme.score],
      ["event", event.score],
      ["direction", direction.score],
      ["magnitude", magnitude.score],
    ]),
  };
}

/** 「起きなかった」と回答された予測項目の評価 (仕様 25: 何も起きなかったこともデータとして残す) */
export function evaluateNonOccurrence(): EvaluationScores {
  return {
    timing_label: null,
    timing_score: null,
    theme_label: null,
    theme_score: null,
    event_label: "mismatch",
    event_score: 0,
    direction_label: null,
    direction_score: null,
    magnitude_label: null,
    magnitude_score: null,
    overall_score: 0,
  };
}

/** 回答が評価レコードを生むか。pending / undeterminable は評価しない (仕様 13)。 */
export function verdictProducesEvaluation(verdict: Verdict): boolean {
  return verdict !== "pending" && verdict !== "undeterminable";
}
