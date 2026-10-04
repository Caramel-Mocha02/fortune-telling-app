/**
 * 自動照合 (Phase 3)。
 *
 * 記録された出来事と予測項目を評価ルールで突き合わせ、関連しそうな組み合わせを「候補」として提示する。
 * 候補は評価として保存しない。ユーザーが答え合わせで確認したときだけ user_confirmed の評価になる
 * (システムが自動で「当たった」と判定しない — 仕様 26 / 54-⑥)。
 */
import { evaluateMatch, type EvaluableItem, type EvaluableOutcome, type EvaluationScores } from "./evaluate";

export const MATCH_THRESHOLD = 0.5;

export interface MatchCandidate<I, O> {
  item: I;
  outcome: O;
  scores: EvaluationScores;
}

/** 時期が大きくずれておらず、テーマが一致または関連するものだけを候補にする */
export function isPlausibleMatch(scores: EvaluationScores): boolean {
  return (
    (scores.timing_label === "within" || scores.timing_label === "early_near" || scores.timing_label === "late_near") &&
    scores.theme_label !== "mismatch" &&
    scores.event_label !== "mismatch" &&
    scores.overall_score >= MATCH_THRESHOLD
  );
}

export function findCandidates<I extends EvaluableItem, O extends EvaluableOutcome>(
  items: I[],
  outcomes: O[],
  limit = 5,
): MatchCandidate<I, O>[] {
  const out: MatchCandidate<I, O>[] = [];
  for (const item of items) {
    for (const outcome of outcomes) {
      const scores = evaluateMatch(item, outcome);
      if (isPlausibleMatch(scores)) out.push({ item, outcome, scores });
    }
  }
  return out.sort((a, b) => b.scores.overall_score - a.scores.overall_score).slice(0, limit);
}

/** 予測項目ごとに最も一致度の高い出来事 (答え合わせ画面の初期選択に使う) */
export function bestOutcomeByItem<I extends EvaluableItem & { id: string }, O extends EvaluableOutcome & { id: string }>(
  items: I[],
  outcomes: O[],
): Record<string, string> {
  const best: Record<string, { id: string; score: number }> = {};
  for (const c of findCandidates(items, outcomes, Infinity)) {
    if (!best[c.item.id] || c.scores.overall_score > best[c.item.id].score) {
      best[c.item.id] = { id: c.outcome.id, score: c.scores.overall_score };
    }
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.id]));
}
