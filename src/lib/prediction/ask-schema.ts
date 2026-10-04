import { z } from "zod";

/** 質問フォームの入力 */
export const AskSchema = z.object({
  question: z.string().trim().min(4, "質問をもう少し具体的に書いてください").max(2000),
  months: z.preprocess(
    (v) => (v === "auto" || v === "" || v == null ? null : Number(v)),
    z.number().int().min(1).max(36).nullable(),
  ),
  parent: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable()),
});

/** /api/predictions が 1 行ずつ返すイベント (NDJSON) */
export type PredictionEvent =
  | { type: "stage"; stage: "question" | "classify" | "compute" | "interpret" | "save" }
  | { type: "done"; id: string }
  | { type: "error"; message: string };
