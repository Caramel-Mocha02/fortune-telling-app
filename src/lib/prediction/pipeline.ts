import "server-only";
/**
 * 予測生成パイプライン (仕様 51)
 *   質問 → 分類 → ルーティング → 計算エンジン → Claude 解釈 → 構造化 → Snapshot → DB
 */
import type { Supabase } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import { BirthDataSchema, type EngineContext, type EngineResult, type PalmReadingInput } from "@/lib/divination/types";
import { ENGINES } from "@/lib/divination/registry";
import { classifyQuestion } from "@/lib/ai/classify";
import { interpret } from "@/lib/ai/interpret";
import { sanitizeItems } from "./sanitize";
import { BASELINE_RULES_VERSION, generateBaselines } from "./baselines";
import { route } from "@/lib/routing/router";
import { periodFrom, planCheckIns, resolvePeriodMonths } from "./schedule";
import { performanceNoteForAi } from "@/lib/evaluation/performance";
import { loadMethodPerformance, themePerformance } from "@/lib/db/queries";
import { personalize, routingTheme } from "@/lib/routing/personalize";
import { birthDataFromRow, type BirthProfileRow, type ForecastReport } from "@/lib/db/types";
import { todayIn } from "@/lib/time/zoned";
import {
  CLAUDE_MODEL,
  PREDICTION_MODEL_VERSION,
  PROMPT_VERSIONS,
} from "@/lib/versions";

export class PredictionError extends Error {}

/** 予測作成の工程 (画面に進み具合を表示するため) */
export const PREDICTION_STAGES = ["question", "classify", "compute", "interpret", "save"] as const;
export type PredictionStage = (typeof PREDICTION_STAGES)[number];

export interface GenerateInput {
  questionText: string;
  /** 確認の質問に答えて再送するとき、最初に保存した質問の ID */
  questionId?: string | null;
  /** 確認の質問への回答 */
  clarificationAnswer?: string | null;
  /** 確認の質問を飛ばしてそのまま予測する */
  skipClarification?: boolean;
  /** null なら質問内容と分類から自動決定 */
  requestedMonths: number | null;
  parentPredictionId: string | null;
  /** 各工程に入るときに呼ばれる */
  onStage?: (stage: PredictionStage) => void;
}

export type GenerateResult =
  | { type: "done"; id: string }
  | { type: "clarify"; questionId: string; question: string; options: string[] };

/** 質問と、確認の質問・回答をまとめた、分類と解釈に渡す文章 */
export function questionWithClarification(question: string, clarification: { question: string; answer: string } | null): string {
  return clarification ? `${question}\n\n(確認: ${clarification.question})\n回答: ${clarification.answer}` : question;
}

export async function generatePrediction(supabase: Supabase, input: GenerateInput): Promise<GenerateResult> {
  // 1. 基礎データ
  const { data: profileRow, error: profileError } = await supabase.from("birth_profiles").select("*").maybeSingle();
  if (profileError) throw new PredictionError(`プロフィールの取得に失敗しました: ${profileError.message}`);
  if (!profileRow) throw new PredictionError("先に生年月日を登録してください。");
  const birth = BirthDataSchema.parse(birthDataFromRow(profileRow as BirthProfileRow));
  const today = todayIn(birth.timeZone);

  const stage = (st: PredictionStage) => input.onStage?.(st);

  // 2. 質問を保存 (予測に失敗しても質問履歴は残す)。確認への回答で再送された場合は最初の質問を使う
  stage("question");
  let question: { id: string; text: string; classification: Record<string, unknown> | null };
  if (input.questionId) {
    const { data, error } = await supabase.from("questions").select("id, text, classification").eq("id", input.questionId).maybeSingle();
    if (error || !data) throw new PredictionError("確認中の質問が見つかりませんでした。もう一度質問してください。");
    question = data;
  } else {
    const { data, error } = await supabase.from("questions").insert({ text: input.questionText }).select("id, text, classification").single();
    if (error) throw new PredictionError(`質問の保存に失敗しました: ${error.message}`);
    question = data;
  }

  // 確認の質問 (仕様 8: ユーザーへの質問) とその回答
  const asked = (question.classification?.clarification ?? null) as { question?: string | null } | null;
  const answer = input.clarificationAnswer?.trim() || null;
  const clarification = asked?.question && answer ? { question: asked.question, answer } : null;
  const alreadyAsked = Boolean(input.questionId);
  const questionText = questionWithClarification(question.text, clarification);

  // 3. 分類
  stage("classify");
  const { output: classification, model: classifyModel } = await classifyQuestion(questionText, today, !alreadyAsked && !input.skipClarification);
  const stored = {
    ...classification,
    clarification: clarification
      ? { ...clarification, needed: false }
      : alreadyAsked || input.skipClarification
        ? { ...(asked ?? {}), needed: false, skipped: true }
        : classification.clarification,
  };
  await supabase
    .from("questions")
    .update({ category: classification.category, themes: classification.themes, classification: stored })
    .eq("id", question.id);

  if (classification.clarification.needed && classification.clarification.question) {
    return {
      type: "clarify",
      questionId: question.id,
      question: classification.clarification.question,
      options: classification.clarification.options.slice(0, 4),
    };
  }

  // 4. 期間とルーティング
  const months = resolvePeriodMonths(classification.category, input.requestedMonths, classification.suggested_horizon_months);
  const period = periodFrom(today, months);
  const { data: palmRows, error: palmError } = await supabase
    .from("palm_readings")
    .select("id, hand, captured_on, observation")
    .order("captured_on", { ascending: false })
    .limit(20);
  if (palmError) throw new PredictionError(`手相データの取得に失敗しました: ${palmError.message}`);
  const palmReadings = (palmRows ?? []) as PalmReadingInput[];
  const baseRouting = route(classification.category, palmReadings.length === 0 ? { palmistry: "手相画像が未登録" } : {});
  // 個人別ルーティング: 過去の実績で主要占術の順序・入れ替えを調整する (データが少なければ全体モデルのまま)
  const theme = routingTheme(classification.category, classification.themes);
  const perf = await loadMethodPerformance(supabase, theme);
  const routing = personalize(baseRouting, theme, perf.user, perf.global);
  const methods = [...routing.primary, ...routing.secondary];

  // 5. 計算エンジン (AI は計算しない)。タロットの引きはこのシードで固定され、Snapshot に残る
  stage("compute");
  const context: EngineContext = { seed: randomUUID(), category: classification.category, palmReadings };
  const engineResults: EngineResult[] = methods.map((m) => ENGINES[m]!.compute({ birth, period, context }));
  const engineVersions = Object.fromEntries(engineResults.map((r) => [r.method, r.engine_version]));

  // 6. 過去実績 (事実のみを AI に渡す)
  const past = await themePerformance(supabase);
  const pastNote = performanceNoteForAi(classification.themes, past);

  // 7. 解釈
  stage("interpret");
  const { output: forecast, model: interpretModel } = await interpret({
    question: questionText,
    category: classification.category,
    today,
    period,
    routing,
    engineResults,
    pastPerformanceNote: pastNote,
  });
  const items = sanitizeItems(forecast.items, period, methods);
  if (items.length === 0) throw new PredictionError("検証可能な予測項目を生成できませんでした。質問を具体的にしてお試しください。");

  // ベースライン予測 (仕様 17): 占術を使わない単純な予測を、予測時点の情報だけで同時に作る
  const { data: pastOutcomes, error: outcomeError } = await supabase
    .from("outcomes")
    .select("occurred_at, theme, event_type, direction, magnitude")
    .lt("occurred_at", today);
  if (outcomeError) throw new PredictionError(`ライフログの取得に失敗しました: ${outcomeError.message}`);
  const baselines = generateBaselines(items, birth.birthDate, today, (pastOutcomes ?? []) as Parameters<typeof generateBaselines>[3]);
  const report: ForecastReport = {
    conclusion: forecast.conclusion,
    agreements: forecast.agreements,
    differences: forecast.differences,
    timing: forecast.timing,
    past_data_note: forecast.past_data_note,
    uncertainties: forecast.uncertainties,
    cautions: forecast.cautions,
    actions: forecast.actions,
  };

  stage("save");

  // 8. Snapshot (仕様 10): 予測時点の入力・設定・生データ・解釈をすべて固定保存する
  const snapshot = {
    schema: "prediction_snapshot_v3",
    created_at: new Date().toISOString(),
    today,
    user_input: { question: question.text, clarification, requested_months: input.requestedMonths },
    birth_data: birth,
    classification,
    period,
    routing,
    engine_context: {
      seed: context.seed,
      palm_reading_ids: methods.includes("palmistry") ? palmReadings.map((r) => r.id) : [],
    },
    versions: {
      routing: routing.routing_version,
      prediction_model: PREDICTION_MODEL_VERSION,
      prompts: PROMPT_VERSIONS,
      engines: engineVersions,
      ai_model_requested: CLAUDE_MODEL,
      ai_model_served: { classify: classifyModel, interpret: interpretModel },
    },
    engine_results: engineResults,
    past_performance_note: pastNote,
    ai_interpretation: forecast,
    final_items: items,
    baselines: { rules_version: BASELINE_RULES_VERSION, items: baselines },
  };

  // 9. 予測・項目・Snapshot・リマインドを 1 トランザクションで保存
  const { data: predictionId, error: saveError } = await supabase.rpc("create_prediction", {
    p: {
      question_id: question.id,
      parent_prediction_id: input.parentPredictionId,
      period_start: period.start,
      period_end: period.end,
      category: classification.category,
      methods,
      routing_version: routing.routing_version,
      prediction_model_version: PREDICTION_MODEL_VERSION,
      ai_model: interpretModel,
      prompt_version: PROMPT_VERSIONS.interpret,
      divination_engine_versions: engineVersions,
      summary: report.conclusion,
      report,
      items,
      snapshot,
      check_ins: planCheckIns(period),
      baseline_items: baselines,
      baseline_rules_version: BASELINE_RULES_VERSION,
    },
  });
  if (saveError) throw new PredictionError(`予測の保存に失敗しました: ${saveError.message}`);
  return { type: "done", id: predictionId as string };
}
