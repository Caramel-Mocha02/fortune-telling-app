/**
 * 個人別ルーティング (仕様 20 / 21 / 22)。
 *
 *   全体モデル → 個人補正 → 個人化モデル
 *
 * 1. 全体の実績 (全ユーザー) を中立値 0.5 に向けて縮小推定する
 * 2. 本人の実績はサンプル数に応じて段階的に重みを持たせる
 *      n < 10       → 個人補正しない (全体モデルのまま)
 *      10 <= n < 30 → 弱い個人補正 (重み半分)
 *      n >= 30      → 個人補正。補助占術を主要に繰り上げることも検討する
 * 3. 占術を除外はしない。主要の順序と、補助 → 主要の入れ替えだけを行う (過学習への備え)
 */
import type { MethodId } from "@/lib/divination/types";
import { METHODS } from "@/lib/divination/registry";
import type { QuestionCategory, Theme } from "@/lib/domain/taxonomy";
import type { RoutingDecision } from "./router";

export const PERSONALIZED_ROUTING_VERSION = "routing_v2";

const PRIOR = 0.5;
const GLOBAL_PRIOR_WEIGHT = 10;
const USER_SHRINK = 20;
export const MIN_USER_SAMPLES = 10;
export const FULL_USER_SAMPLES = 30;
const PROMOTION_MARGIN = 0.1;

export interface PerfCell {
  n: number;
  event_score: number | null;
  timing_score: number | null;
}

export interface MethodWeight {
  method: MethodId;
  estimate: number;
  user_n: number;
  global_n: number;
  user_weight: number;
  level: "global_only" | "weak_personal" | "personal";
}

export interface Personalization {
  theme: Theme;
  applied: boolean;
  weights: MethodWeight[];
  changes: string[];
}

const cellScore = (c: PerfCell | undefined): number | null => {
  if (!c) return null;
  const xs = [c.event_score, c.timing_score].filter((x): x is number => x !== null);
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
};

export function userWeight(n: number): number {
  if (n < MIN_USER_SAMPLES) return 0;
  const w = n / (n + USER_SHRINK);
  return n < FULL_USER_SAMPLES ? w / 2 : w;
}

export function estimate(user: PerfCell | undefined, global: PerfCell | undefined): Omit<MethodWeight, "method"> {
  const gs = cellScore(global);
  const gn = global?.n ?? 0;
  const globalEst = gs === null ? PRIOR : (gn * gs + GLOBAL_PRIOR_WEIGHT * PRIOR) / (gn + GLOBAL_PRIOR_WEIGHT);
  const us = cellScore(user);
  const un = user?.n ?? 0;
  const w = us === null ? 0 : userWeight(un);
  return {
    estimate: Math.round((w * (us ?? 0) + (1 - w) * globalEst) * 1000) / 1000,
    user_n: un,
    global_n: gn,
    user_weight: Math.round(w * 1000) / 1000,
    level: w === 0 ? "global_only" : un < FULL_USER_SAMPLES ? "weak_personal" : "personal",
  };
}

const CATEGORY_THEME: Partial<Record<QuestionCategory, Theme>> = {
  CAREER: "career",
  MONEY: "money",
  LOVE: "love",
  MARRIAGE: "marriage",
  RELATIONSHIP: "relationship",
  STUDY: "study",
  HEALTH: "health",
  MOVE: "move",
  TRAVEL: "travel",
};

/** 実績を引くテーマ: 分類器のテーマ → カテゴリーの対応 → other */
export function routingTheme(category: QuestionCategory, themes: Theme[]): Theme {
  return themes[0] ?? CATEGORY_THEME[category] ?? "other";
}

export function personalize(
  decision: RoutingDecision,
  theme: Theme,
  user: Partial<Record<MethodId, PerfCell>>,
  global: Partial<Record<MethodId, PerfCell>>,
): RoutingDecision {
  const methods = [...decision.primary, ...decision.secondary];
  const weights = methods.map((m) => ({ method: m, ...estimate(user[m], global[m]) }));
  const est = (m: MethodId) => weights.find((w) => w.method === m)!;
  const changes: string[] = [];

  // 主要占術を推定値の高い順に並べ替える (同値なら元の順)
  const primary = [...decision.primary].sort((a, b) => est(b).estimate - est(a).estimate);
  if (primary.join() !== decision.primary.join()) {
    changes.push(`主要占術の優先順を実績に基づいて変更: ${primary.map((m) => METHODS[m].label).join(" > ")}`);
  }

  // 十分な個人データがある補助占術は、最も弱い主要占術を明確に上回れば入れ替える
  const secondary = [...decision.secondary];
  for (const s of decision.secondary) {
    if (est(s).user_n < FULL_USER_SAMPLES || primary.length === 0) continue;
    const weakest = primary[primary.length - 1];
    if (est(s).estimate >= est(weakest).estimate + PROMOTION_MARGIN) {
      primary[primary.length - 1] = s;
      secondary[secondary.indexOf(s)] = weakest;
      primary.sort((a, b) => est(b).estimate - est(a).estimate);
      changes.push(`${METHODS[s].label} を補助から主要へ、${METHODS[weakest].label} を主要から補助へ入れ替え`);
    }
  }

  return {
    ...decision,
    routing_version: PERSONALIZED_ROUTING_VERSION,
    primary,
    secondary,
    personalization: {
      theme,
      applied: weights.some((w) => w.level !== "global_only"),
      weights,
      changes,
    },
  };
}
