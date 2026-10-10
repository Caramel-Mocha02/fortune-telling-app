import "server-only";
import { z } from "zod";
import {
  DirectionSchema,
  EventTypeSchema,
  EVENT_TYPES,
  MagnitudeSchema,
  SpecificitySchema,
  ThemeSchema,
} from "@/lib/domain/taxonomy";
import { METHOD_IDS, type EngineResult, type PredictionPeriod } from "@/lib/divination/types";
import { METHODS } from "@/lib/divination/registry";
import type { RoutingDecision } from "@/lib/routing/router";
import { callStructured } from "./client";

const MethodIdSchema = z.enum(METHOD_IDS);

export const PredictionItemDraftSchema = z.object({
  theme: ThemeSchema,
  event_type: EventTypeSchema,
  direction: DirectionSchema,
  magnitude: MagnitudeSchema,
  specificity: SpecificitySchema,
  start_date: z.string().describe("YYYY-MM-DD。予測期間内"),
  end_date: z.string().describe("YYYY-MM-DD。予測期間内で start_date 以降"),
  description: z.string().describe("ユーザー向けの一文。後で答え合わせできる具体的な表現"),
  supporting_methods: z.array(MethodIdSchema).describe("この予測を支持する占術"),
  signal_strength: z.enum(["weak", "moderate", "strong"]).describe("占術上のシグナルの強さ (過去の的中実績ではない)"),
  rationale: z.string().describe("どの占いで、どんな傾向が見えたか (専門用語を使わず日常の言葉で一文)"),
});
export type PredictionItemDraft = z.infer<typeof PredictionItemDraftSchema>;

export const ForecastSchema = z.object({
  conclusion: z.string().describe("結論。2〜3文"),
  agreements: z.array(z.object({ point: z.string(), methods: z.array(MethodIdSchema) })),
  past_data_note: z.string().describe("過去の予測実績に関する一文。提供されたデータの範囲でのみ述べる"),
  actions: z.array(z.string()).describe("今できること"),
  items: z.array(PredictionItemDraftSchema).describe("検証可能な予測項目 (2〜6件)"),
});
export type Forecast = z.infer<typeof ForecastSchema>;

const EVENT_TYPE_GUIDE = Object.entries(EVENT_TYPES)
  .map(([k, v]) => `${k}=${v.label}`)
  .join(", ");

const SYSTEM = `あなたは「予測検証型ライフログアプリ」の解釈エンジンです。
複数の占術の計算結果 (専用エンジンが算出済みの構造化データ) を読み、後から現実と照合できる予測レポートを作ります。

## 原則
- 天体位置・干支・大運などを自分で計算し直したり、データにない配置を作り出したりしない。根拠は渡された計算結果だけ。
- 各結果の caveats を読む。null や「算出していない」要素 (出生時刻不明時の命盤など) を推測で補わず、その占術の示唆は弱いものとして扱う。
- 方位 (九星気学の吉方・凶方) は、引っ越し・旅行など移動に関わる質問でだけ予測項目に使う。
- タロットは引かれたカードの象徴から現状と近未来を読む。タロットだけを根拠にする予測項目の期間は、データの near_future_horizon_months 以内に収める。
- 手相は現在の状態・傾向と、前回登録からの変化を示すもの。手相だけを根拠に長期の時期を予測しない。
- 各占術の結果を解釈し、複数の占術に共通する点と、検証できる予測項目にまとめる。時期は各予測項目の期間として示す。
- 占術の数を票として数えない。同じ相関グループ (例: 四柱推命と算命学) の一致は独立した一致とみなさない。
- 「必ず」「確実に」「〜%当たる」のような断定や的中率の表現は使わない。
- 医療・法律・投資・重大な人生判断について、占術を客観的根拠として扱わない。
- 占術は自己理解・内省・仮説形成のためのものという立場で、穏やかで実用的な日本語で書く。

## 書き方 (読む人は占いに詳しくない)
ユーザーに見せる文章 (conclusion, agreements の point, items の description と rationale, actions, past_data_note) では、占いの専門用語を使わない。
- 使わない言葉の例: ハウス、アスペクト、トランジット、合・スクエア・トライン・オポジション、進行、ASC・MC、度数、命式、日主、十神 (比肩・劫財・食神・傷官・偏財・正財・偏官・正官・偏印・印綬)、蔵干、五行、大運、流年、流月、干支の名前 (甲子・丙午など)、十大主星・十二大従星、天中殺、命宮・官禄宮などの宮、四化・化禄・化忌、本命星・月命星、五黄殺・暗剣殺、ピナクル、ライフパス、正位置・逆位置
- 代わりに、それが日常で何を意味するかを書く。例:「仕事を表す星に土星が重なる時期」→「仕事で責任が増え、重さを感じやすい時期」、「流年が偏官」→「この年はプレッシャーのかかる役割を任されやすい流れ」
- 占いの名前 (西洋占星術・四柱推命・紫微斗数・算命学・九星気学・数秘術・タロット・手相) と、方位の向き (北東など) は使ってよい
- rationale は「どの占いで、どんな傾向が見えたか」を一文の日常の言葉で書く (例:「西洋占星術と四柱推命の両方で、この時期に立場が変わりやすい流れが出ている」)
- 一文を短くし、むずかしい漢語より分かりやすい言葉を選ぶ

## 予測項目 (items) の作り方
- 予測は後で「何が・いつ・どの方向に・どの程度」起きたかで評価される。曖昧な「良いことがある」は避け、検証できる単位に分解する。
- start_date / end_date は予測期間内の具体的な日付範囲にする。根拠となるトランジットや流月の時期に合わせる。
- event_type は次から選ぶ: ${EVENT_TYPE_GUIDE}
- direction: positive=良化, negative=悪化, change=方向を問わない変化, stable=現状維持, unknown=不明
- specificity: abstract / moderate / specific。具体的な出来事を言うほど specific。
- signal_strength は占術上の示唆の強さ。過去にユーザーに当たったかどうかではない。
- supporting_methods にはその項目を実際に支持する占術だけを入れる。

## 過去データ
past_data_note は、提供された「過去の予測実績」の範囲でだけ書く。データ不足なら「まだ検証データが少ない」と正直に書く。

## 占術の重み
「占術の過去実績による重み」がある場合、推定値の高い占術の示唆を優先して構わない。
ただし level が global_only の占術についてはこのユーザー個人の傾向として語らない。
推定値は占術上のシグナルの強さとは別物なので、signal_strength に混ぜない。`;

export interface InterpretInput {
  question: string;
  category: string;
  today: string;
  period: PredictionPeriod;
  routing: RoutingDecision;
  engineResults: EngineResult[];
  pastPerformanceNote: string;
  /** 解釈の深さ (既定 high) */
  effort?: "low" | "medium" | "high";
}

export async function interpret(input: InterpretInput) {
  const roles = [
    ...input.routing.primary.map((m) => `${METHODS[m].label} (${m}, 主要, グループ: ${METHODS[m].group})`),
    ...input.routing.secondary.map((m) => `${METHODS[m].label} (${m}, 補助, グループ: ${METHODS[m].group})`),
  ].join("\n");

  const user = `今日の日付: ${input.today}
予測期間: ${input.period.start} 〜 ${input.period.end}
質問分類: ${input.category}

## ユーザーの質問
${input.question}

## 使用する占術
${roles}

## 占術の計算結果 (JSON)
${JSON.stringify(input.engineResults)}

## 過去の予測実績
${input.pastPerformanceNote}

## 占術の過去実績による重み (テーマ: ${input.routing.personalization?.theme ?? "—"})
${
  input.routing.personalization
    ? input.routing.personalization.weights
        .map((w) => `${METHODS[w.method].label}: 推定 ${w.estimate} / level ${w.level} / 本人 ${w.user_n} 件・全体 ${w.global_n} 件`)
        .join("\n")
    : "なし"
}`;

  return callStructured({ system: SYSTEM, user, schema: ForecastSchema, effort: input.effort ?? "high" });
}
