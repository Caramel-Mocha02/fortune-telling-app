/**
 * 手相画像から抽出する「観察結果」の構造。
 * 画像の読み取りは登録時に 1 回だけ行って保存し (palm_readings)、
 * 予測時はこの構造化データだけを使う。
 */
import { z } from "zod";

export const LINE_FEATURES = ["break", "island", "chain", "fork", "branch_up", "branch_down", "cross", "star"] as const;

const LineSchema = z.object({
  visible: z.boolean(),
  length: z.enum(["short", "medium", "long", "unknown"]),
  depth: z.enum(["faint", "moderate", "deep", "unknown"]),
  features: z.array(z.enum(LINE_FEATURES)).describe("線上に見える特徴。なければ空配列"),
});

export const PalmObservationSchema = z.object({
  image_quality: z.enum(["good", "fair", "poor"]),
  usable: z.boolean().describe("手のひらの主要な線が判別できる画像か"),
  hand_shape: z.enum(["earth", "air", "fire", "water", "unknown"]).describe("手の形の四分類"),
  lines: z.object({
    life: LineSchema.describe("生命線"),
    head: LineSchema.describe("頭脳線"),
    heart: LineSchema.describe("感情線"),
    fate: LineSchema.describe("運命線"),
    sun: LineSchema.describe("太陽線"),
  }),
  notes: z.string().describe("観察上の補足 (照明・角度など読み取りの限界を含む)"),
});
export type PalmObservation = z.infer<typeof PalmObservationSchema>;

export const LINE_LABELS: Record<keyof PalmObservation["lines"], string> = {
  life: "生命線",
  head: "頭脳線",
  heart: "感情線",
  fate: "運命線",
  sun: "太陽線",
};
