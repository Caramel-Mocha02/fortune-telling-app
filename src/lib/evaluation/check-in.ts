/**
 * 答え合わせの回答 → 評価レコードの変換ルール。
 *
 * - 出来事 (outcome) が紐付いた「起きた/少し/似た」: ルールで多軸評価 → user_confirmed
 * - 出来事が紐付かない「起きた/少し/似た」: 根拠となる記録がないため ambiguous (仕様 26)
 * - 「起きなかった」: 予測期間終了後のみ不一致として評価。期間中なら評価せず回答だけ残す (仕様 13)
 * - 「まだ分からない」「判断できない」: 回答のみ保存
 */
import type { Verdict } from "@/lib/domain/taxonomy";
import { EVALUATION_RULES_VERSION } from "@/lib/versions";
import {
  evaluateMatch,
  evaluateNonOccurrence,
  verdictProducesEvaluation,
  type EvaluableItem,
  type EvaluableOutcome,
  type EvaluationScores,
} from "./evaluate";

export interface CheckInAnswer {
  verdict: Verdict;
  outcome: (EvaluableOutcome & { id: string }) | null;
}

export type EvaluationPayload = EvaluationScores & {
  evaluation_source: "user_confirmed" | "ambiguous";
  rules_version: string;
};

const VERDICT_EVENT_SCORE: Partial<Record<Verdict, number>> = { occurred: 1, partially: 0.5, similar: 0.5 };

export function buildEvaluation(item: EvaluableItem, answer: CheckInAnswer, today: string): EvaluationPayload | null {
  if (!verdictProducesEvaluation(answer.verdict)) return null;

  if (answer.verdict === "not_occurred") {
    if (today <= item.end_date) return null;
    return { ...evaluateNonOccurrence(), evaluation_source: "user_confirmed", rules_version: EVALUATION_RULES_VERSION };
  }

  if (answer.outcome) {
    return { ...evaluateMatch(item, answer.outcome), evaluation_source: "user_confirmed", rules_version: EVALUATION_RULES_VERSION };
  }

  const score = VERDICT_EVENT_SCORE[answer.verdict] ?? 0;
  return {
    timing_label: null,
    timing_score: null,
    theme_label: null,
    theme_score: null,
    event_label: score >= 1 ? "match" : "similar",
    event_score: score,
    direction_label: null,
    direction_score: null,
    magnitude_label: null,
    magnitude_score: null,
    overall_score: score,
    evaluation_source: "ambiguous",
    rules_version: EVALUATION_RULES_VERSION,
  };
}
