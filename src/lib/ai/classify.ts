import "server-only";
import { z } from "zod";
import { QuestionCategorySchema, ThemeSchema } from "@/lib/domain/taxonomy";
import { callStructured } from "./client";

export const ClassificationSchema = z.object({
  category: QuestionCategorySchema,
  themes: z.array(ThemeSchema).describe("質問に関係するテーマ (1〜3個)"),
  suggested_horizon_months: z
    .number()
    .int()
    .nullable()
    .describe("質問が想定している予測期間 (月数)。明示や示唆がなければ null"),
  sensitive_domain: z
    .enum(["medical", "legal", "financial_investment", "none"])
    .describe("医療・法律・投資判断に関わる質問か"),
});
export type Classification = z.infer<typeof ClassificationSchema>;

const SYSTEM = `あなたは占術予測アプリの質問分類器です。ユーザーの質問を分類し、指定スキーマの JSON だけを返します。

カテゴリーの定義:
- LIFE: 人生全体・今後の流れ
- CAREER: 仕事・キャリア
- MONEY: お金・金運
- LOVE: 恋愛・出会い
- MARRIAGE: 結婚
- RELATIONSHIP: 恋愛以外の人間関係
- STUDY: 学習・試験・資格
- HEALTH: 健康
- MOVE: 引っ越し・住まい
- TRAVEL: 旅行
- DECISION: 「〜すべきか」など今の選択の判断
- TIMING: 「いつ〜」など時期そのものを問う質問で、他の領域に当てはまらないもの
- CURRENT_STATE: 最近・今の自分の状態
- OTHER: どれにも当てはまらない

「いつ恋人ができる？」のように領域が明確な時期の質問は、TIMING ではなく領域側 (LOVE) を選びます。
「今年」「来年」「半年以内」などの表現があれば suggested_horizon_months に反映します (今年 → 今年の残り月数)。`;

export async function classifyQuestion(question: string, today: string) {
  return callStructured({
    system: SYSTEM,
    user: `今日の日付: ${today}\n\n質問:\n${question}`,
    schema: ClassificationSchema,
    effort: "low",
    maxTokens: 2000,
  });
}
