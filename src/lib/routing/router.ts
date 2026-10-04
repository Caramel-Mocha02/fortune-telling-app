/**
 * 占術ルーター (仕様 6)。
 * 質問分類 → 使用占術。ルールはバージョン付きで保存し、
 * 予測ごとに「どのルールで、どの占術を選び、何をスキップしたか」を記録する。
 */
import type { QuestionCategory } from "@/lib/domain/taxonomy";
import type { MethodId } from "@/lib/divination/types";
import { isImplemented, METHODS } from "@/lib/divination/registry";

export const ROUTING_VERSION = "routing_v1";

interface RoutingRule {
  primary: MethodId[];
  secondary: MethodId[];
}

export const ROUTING_RULES_V1: Record<QuestionCategory, RoutingRule> = {
  LIFE: { primary: ["western_astrology", "four_pillars", "zi_wei_dou_shu"], secondary: ["sanmei", "numerology"] },
  CAREER: { primary: ["western_astrology", "four_pillars", "zi_wei_dou_shu"], secondary: ["sanmei"] },
  MONEY: { primary: ["four_pillars", "zi_wei_dou_shu", "western_astrology"], secondary: ["numerology"] },
  LOVE: { primary: ["western_astrology", "four_pillars", "zi_wei_dou_shu"], secondary: ["sanmei", "numerology"] },
  MARRIAGE: { primary: ["western_astrology", "four_pillars", "zi_wei_dou_shu"], secondary: ["sanmei"] },
  RELATIONSHIP: { primary: ["western_astrology", "zi_wei_dou_shu", "four_pillars"], secondary: ["sanmei"] },
  STUDY: { primary: ["western_astrology", "four_pillars"], secondary: ["numerology"] },
  HEALTH: { primary: ["western_astrology", "four_pillars"], secondary: [] },
  MOVE: { primary: ["kyusei", "western_astrology", "four_pillars"], secondary: [] },
  TRAVEL: { primary: ["kyusei", "western_astrology"], secondary: ["four_pillars"] },
  DECISION: { primary: ["tarot", "western_astrology"], secondary: ["four_pillars"] },
  TIMING: { primary: ["western_astrology", "four_pillars", "kyusei"], secondary: ["numerology"] },
  CURRENT_STATE: { primary: ["palmistry", "tarot", "western_astrology"], secondary: ["four_pillars"] },
  OTHER: { primary: ["western_astrology", "four_pillars"], secondary: [] },
};

export interface RoutingDecision {
  routing_version: string;
  category: QuestionCategory;
  primary: MethodId[];
  secondary: MethodId[];
  /** ルール上は選ばれたが未実装などで使わなかった占術 */
  skipped: Array<{ method: MethodId; role: "primary" | "secondary"; reason: string }>;
}

/**
 * @param unavailable 実装済みでもこのユーザーには使えない占術と理由 (例: 手相画像が未登録)
 */
export function route(category: QuestionCategory, unavailable: Partial<Record<MethodId, string>> = {}): RoutingDecision {
  const rule = ROUTING_RULES_V1[category];
  const skipped: RoutingDecision["skipped"] = [];
  const keep = (methods: MethodId[], role: "primary" | "secondary") =>
    methods.filter((m) => {
      if (!isImplemented(m)) {
        skipped.push({ method: m, role, reason: `未実装 (Phase ${METHODS[m].phase} 予定)` });
        return false;
      }
      if (unavailable[m]) {
        skipped.push({ method: m, role, reason: unavailable[m]! });
        return false;
      }
      return true;
    });

  let primary = keep(rule.primary, "primary");
  let secondary = keep(rule.secondary, "secondary");
  // 主要占術がすべて未実装なら、補助のうち実装済みのものを主要に繰り上げる
  if (primary.length === 0) {
    primary = secondary;
    secondary = [];
  }
  if (primary.length === 0) primary = ["western_astrology", "four_pillars"];

  return { routing_version: ROUTING_VERSION, category, primary, secondary, skipped };
}
