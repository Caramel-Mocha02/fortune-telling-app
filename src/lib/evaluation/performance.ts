/**
 * 個人の予測実績の要約 (仕様 22 / 35 / 36)。
 * 十分なサンプルがない指標は出さず「データ不足」とする。数値を的中率として断定しない。
 */
import { THEME_LABELS, type Theme } from "@/lib/domain/taxonomy";

export const MIN_SAMPLES_FOR_SIGNAL = 10;
export const MIN_SAMPLES_FOR_PERSONALIZATION = 30;

export interface EvaluatedRow {
  theme: Theme;
  timing_score: number | null;
  theme_score: number | null;
  event_score: number;
}

export type EvidenceLevel = "insufficient" | "weak" | "moderate";

export interface ThemePerformance {
  theme: Theme;
  sample_count: number;
  level: EvidenceLevel;
  /** level が insufficient のときは null (表示しない) */
  timing_match_rate: number | null;
  event_match_rate: number | null;
}

export function evidenceLevel(n: number): EvidenceLevel {
  if (n < MIN_SAMPLES_FOR_SIGNAL) return "insufficient";
  if (n < MIN_SAMPLES_FOR_PERSONALIZATION) return "weak";
  return "moderate";
}

export const EVIDENCE_LABELS: Record<EvidenceLevel, string> = {
  insufficient: "データ不足",
  weak: "参考程度",
  moderate: "一定のデータあり",
};

const rate = (xs: Array<number | null>, threshold: number) => {
  const valid = xs.filter((x): x is number => x !== null);
  return valid.length === 0 ? null : valid.filter((x) => x >= threshold).length / valid.length;
};

export function summarizeByTheme(rows: EvaluatedRow[]): ThemePerformance[] {
  const byTheme = new Map<Theme, EvaluatedRow[]>();
  for (const r of rows) byTheme.set(r.theme, [...(byTheme.get(r.theme) ?? []), r]);
  return [...byTheme.entries()].map(([theme, rs]) => {
    const level = evidenceLevel(rs.length);
    const show = level !== "insufficient";
    return {
      theme,
      sample_count: rs.length,
      level,
      timing_match_rate: show ? rate(rs.map((r) => r.timing_score), 1) : null,
      event_match_rate: show ? rate(rs.map((r) => r.event_score), 0.5) : null,
    };
  });
}

/** 解釈 AI に渡す、過去実績の事実ベースの要約文 */
export function performanceNoteForAi(themes: Theme[], summary: ThemePerformance[]): string {
  if (summary.length === 0) return "まだ評価済みの予測がない (データ不足)。";
  const lines = themes.map((t) => {
    const s = summary.find((x) => x.theme === t);
    if (!s) return `${THEME_LABELS[t]}: 評価済み 0 件 (データ不足)`;
    if (s.level === "insufficient") return `${THEME_LABELS[t]}: 評価済み ${s.sample_count} 件 (データ不足、傾向は判断できない)`;
    const pct = (x: number | null) => (x === null ? "不明" : `${Math.round(x * 100)}%`);
    return `${THEME_LABELS[t]}: 評価済み ${s.sample_count} 件 (${EVIDENCE_LABELS[s.level]}) / 時期が期間内だった割合 ${pct(s.timing_match_rate)} / 出来事が一致・類似した割合 ${pct(s.event_match_rate)}`;
  });
  return lines.join("\n");
}
