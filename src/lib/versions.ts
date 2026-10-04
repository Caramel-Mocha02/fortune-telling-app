/**
 * 予測の再現・新旧比較のため、全予測にこれらのバージョンを記録する (仕様 23 / 24)。
 * プロンプトや生成ロジックを変えたら必ず値を上げること。
 * DB の model_versions / prompt_versions にも同じ値を登録する (supabase/migrations 参照)。
 */
export { ROUTING_VERSION } from "@/lib/routing/router";
export { WESTERN_ENGINE_VERSION } from "@/lib/divination/western/engine";
export { FOUR_PILLARS_ENGINE_VERSION } from "@/lib/divination/four-pillars/engine";
export { ZI_WEI_ENGINE_VERSION } from "@/lib/divination/zi-wei/engine";
export { SANMEI_ENGINE_VERSION } from "@/lib/divination/sanmei/engine";
export { KYUSEI_ENGINE_VERSION } from "@/lib/divination/kyusei/engine";
export { NUMEROLOGY_ENGINE_VERSION } from "@/lib/divination/numerology/engine";
export { TAROT_ENGINE_VERSION } from "@/lib/divination/tarot/engine";
export { PALMISTRY_ENGINE_VERSION } from "@/lib/divination/palmistry/engine";

/**
 * 予測生成パイプライン全体 (使用占術・期間決定・構造化・保存ルール) のバージョン
 * v1: 西洋占星術・四柱推命 (Phase 1)
 * v2: + 紫微斗数・算命学・九星気学・数秘術 (Phase 2)
 * v3: + タロット・手相 (Phase 3)
 */
export const PREDICTION_MODEL_VERSION = "prediction_model_v3";

export const PROMPT_VERSIONS = {
  classify: "classify_v1",
  interpret: "interpret_v3",
  structureEvent: "structure_event_v1",
  observePalm: "observe_palm_v1",
} as const;

export const CLAUDE_MODEL = "claude-opus-5-5";

/** 評価ルールのバージョン (仕様 54-⑥: 評価ルールを明確化し記録する) */
export const EVALUATION_RULES_VERSION = "evaluation_rules_v1";
