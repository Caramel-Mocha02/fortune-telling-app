import { z } from "zod";

/** 質問フォームの入力 */
export const AskSchema = z.object({
  question: z.string().trim().min(4, "質問をもう少し具体的に書いてください").max(2000),
  months: z.preprocess(
    (v) => (v === "auto" || v === "" || v == null ? null : Number(v)),
    z.number().int().min(1).max(36).nullable(),
  ),
  parent: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable()),
  /** 確認の質問に答えて再送するとき */
  question_id: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable()).optional(),
  clarification_answer: z.string().trim().max(500).nullable().optional(),
  skip_clarification: z.boolean().optional(),
  /** 手相の登録を求められた後の選択 */
  palm_decision: z.enum(["skip", "use_existing"]).optional(),
});

/** /api/predictions が 1 行ずつ返すイベント (NDJSON) */
export type PredictionEvent =
  | { type: "stage"; stage: "question" | "classify" | "compute" | "interpret" | "save" }
  | { type: "done"; id: string }
  | { type: "clarify"; question_id: string; question: string; options: string[] }
  | { type: "need_palm"; question_id: string; reason: "none" | "stale"; days_since: number | null }
  | { type: "error"; message: string };
