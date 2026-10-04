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
  clarification: z.object({
    needed: z.boolean().describe("このままでは検証可能な予測を作れないほど曖昧か"),
    question: z.string().nullable().describe("needed のときだけ、ユーザーへの確認の質問 (1文)"),
    options: z.array(z.string()).describe("needed のときだけ、回答の候補 (2〜4個、短く)。不要なら空配列"),
  }),
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
「今年」「来年」「半年以内」などの表現があれば suggested_horizon_months に反映します (今年 → 今年の残り月数)。

## 確認の質問 (clarification)
予測は後で現実と照合されるため、何についての予測か分からない質問には、作る前に 1 回だけ確認します。
needed=true にするのは、次のように対象が特定できず予測項目を作れない場合だけです。
- 比べる選択肢が書かれていない (例:「どっちがいいと思う？」)
- 指示語だけで対象が分からない (例:「あれはうまくいく？」)
- テーマがまったく読み取れない (例:「どう？」)
次の場合は確認せず needed=false にします。
- 「今後の人生全体を見て」「最近の自分の状態は？」など、広いが対象ははっきりしている質問
- 期間が書かれていないだけの質問 (期間はアプリが決める)
確認の質問は短く具体的にし、options には答えやすい候補を入れます。`;

/**
 * @param allowClarification false なら確認の質問はしない (回答済み・スキップ済みのとき)
 */
export async function classifyQuestion(question: string, today: string, allowClarification = true) {
  const rule = allowClarification
    ? ""
    : "\n\n(このユーザーには確認済みです。clarification.needed は必ず false、question は null、options は空配列にしてください)";
  const result = await callStructured({
    system: SYSTEM,
    user: `今日の日付: ${today}\n\n質問:\n${question}${rule}`,
    schema: ClassificationSchema,
    effort: "low",
    maxTokens: 2000,
  });
  if (!allowClarification) result.output.clarification = { needed: false, question: null, options: [] };
  return result;
}
