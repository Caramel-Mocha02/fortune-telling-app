/**
 * 予測・現実・評価で共有する分類体系。
 * 予測項目 (prediction_items) と現実の出来事 (outcomes) は同じ語彙で構造化し、
 * 評価エンジンが機械的に照合できるようにする。
 */
import { z } from "zod";

// --- テーマ (仕様 2.1 / 30) -------------------------------------------------
export const THEMES = [
  "love",
  "marriage",
  "career",
  "money",
  "health",
  "relationship",
  "study",
  "move",
  "travel",
  "family",
  "other",
] as const;
export const ThemeSchema = z.enum(THEMES);
export type Theme = z.infer<typeof ThemeSchema>;

export const THEME_LABELS: Record<Theme, string> = {
  love: "恋愛",
  marriage: "結婚",
  career: "仕事",
  money: "お金",
  health: "健康",
  relationship: "人間関係",
  study: "学習",
  move: "引っ越し",
  travel: "旅行",
  family: "家族",
  other: "その他",
};

/** テーマ間の「関連」関係。評価で theme_score = 部分一致 を与える。 */
export const RELATED_THEMES: Record<Theme, Theme[]> = {
  love: ["marriage", "relationship"],
  marriage: ["love", "family", "relationship"],
  career: ["money", "study", "relationship"],
  money: ["career"],
  health: [],
  relationship: ["love", "career", "family"],
  study: ["career"],
  move: ["travel", "family"],
  travel: ["move"],
  family: ["marriage", "relationship", "move"],
  other: [],
};

// --- 方向 -----------------------------------------------------------------
export const DIRECTIONS = ["positive", "negative", "change", "stable", "unknown"] as const;
export const DirectionSchema = z.enum(DIRECTIONS);
export type Direction = z.infer<typeof DirectionSchema>;
export const DIRECTION_LABELS: Record<Direction, string> = {
  positive: "良化",
  negative: "悪化",
  change: "変化",
  stable: "継続",
  unknown: "不明",
};

// --- 規模・具体性 -----------------------------------------------------------
export const MAGNITUDES = ["small", "medium", "large"] as const;
export const MagnitudeSchema = z.enum(MAGNITUDES);
export type Magnitude = z.infer<typeof MagnitudeSchema>;
export const MAGNITUDE_LABELS: Record<Magnitude, string> = {
  small: "小",
  medium: "中",
  large: "大",
};

export const SPECIFICITIES = ["abstract", "moderate", "specific"] as const;
export const SpecificitySchema = z.enum(SPECIFICITIES);
export type Specificity = z.infer<typeof SpecificitySchema>;
export const SPECIFICITY_LABELS: Record<Specificity, string> = {
  abstract: "抽象的",
  moderate: "中程度",
  specific: "具体的",
};

// --- イベント種別 (仕様 31) --------------------------------------------------
// family で「類似イベント」を判定する。
export const EVENT_TYPES = {
  job_change: { label: "転職", family: "career_shift" },
  promotion: { label: "昇進", family: "career_shift" },
  role_change: { label: "役割・部署の変化", family: "career_shift" },
  new_project: { label: "新しいプロジェクト", family: "career_shift" },
  job_loss: { label: "退職・失職", family: "career_shift" },
  business_start: { label: "独立・起業", family: "career_shift" },
  income_increase: { label: "収入増", family: "finance" },
  income_decrease: { label: "収入減・出費", family: "finance" },
  big_purchase: { label: "大きな買い物", family: "finance" },
  windfall: { label: "臨時収入", family: "finance" },
  new_encounter: { label: "新しい出会い", family: "romance" },
  relationship_start: { label: "交際開始", family: "romance" },
  breakup: { label: "別れ", family: "romance" },
  engagement: { label: "婚約", family: "partnership" },
  marriage: { label: "結婚", family: "partnership" },
  divorce: { label: "離婚", family: "partnership" },
  new_connection: { label: "新しい人間関係", family: "social" },
  conflict: { label: "対人トラブル", family: "social" },
  reconciliation: { label: "関係修復", family: "social" },
  certification: { label: "資格取得・合格", family: "learning" },
  study_start: { label: "学び始め", family: "learning" },
  relocation: { label: "引っ越し", family: "moving" },
  travel_domestic: { label: "国内旅行", family: "travel" },
  travel_abroad: { label: "海外旅行", family: "travel" },
  health_issue: { label: "体調不良・病気", family: "health" },
  health_improvement: { label: "体調改善", family: "health" },
  family_event: { label: "家族の出来事", family: "family" },
  general_change: { label: "全般的な変化", family: "general" },
  other: { label: "その他", family: "general" },
} as const satisfies Record<string, { label: string; family: string }>;

export type EventType = keyof typeof EVENT_TYPES;
export const EVENT_TYPE_KEYS = Object.keys(EVENT_TYPES) as [EventType, ...EventType[]];
export const EventTypeSchema = z.enum(EVENT_TYPE_KEYS);

// --- 質問分類 (仕様 5.1) ---------------------------------------------------
export const QUESTION_CATEGORIES = [
  "LIFE",
  "CAREER",
  "MONEY",
  "LOVE",
  "MARRIAGE",
  "RELATIONSHIP",
  "STUDY",
  "HEALTH",
  "MOVE",
  "TRAVEL",
  "DECISION",
  "TIMING",
  "CURRENT_STATE",
  "OTHER",
] as const;
export const QuestionCategorySchema = z.enum(QUESTION_CATEGORIES);
export type QuestionCategory = z.infer<typeof QuestionCategorySchema>;
export const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  LIFE: "人生全体",
  CAREER: "仕事",
  MONEY: "お金",
  LOVE: "恋愛",
  MARRIAGE: "結婚",
  RELATIONSHIP: "人間関係",
  STUDY: "学習",
  HEALTH: "健康",
  MOVE: "引っ越し",
  TRAVEL: "旅行",
  DECISION: "意思決定",
  TIMING: "タイミング",
  CURRENT_STATE: "現在の状態",
  OTHER: "その他",
};

// --- 答え合わせの回答 (仕様 12 / 28) -----------------------------------------
export const VERDICTS = [
  "occurred",
  "partially",
  "similar",
  "not_occurred",
  "pending",
  "undeterminable",
] as const;
export const VerdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof VerdictSchema>;
export const VERDICT_LABELS: Record<Verdict, string> = {
  occurred: "👍 起きた",
  partially: "🌓 少し起きた",
  similar: "🔁 似たことが起きた",
  not_occurred: "❌ 起きなかった",
  pending: "⏳ まだ分からない",
  undeterminable: "🤔 判断できない",
};

/** 評価の出所 (仕様 26)。後付け解釈を区別する。 */
export const EVALUATION_SOURCES = ["user_confirmed", "ai_estimated", "ambiguous"] as const;
export type EvaluationSource = (typeof EVALUATION_SOURCES)[number];
