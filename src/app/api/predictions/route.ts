import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { generatePrediction, PredictionError } from "@/lib/prediction/pipeline";
import { AskSchema, type PredictionEvent } from "@/lib/prediction/ask-schema";
import { AiError } from "@/lib/ai/client";

// 予測の作成 (占術計算 + Claude の解釈) は 1〜2 分かかる
export const maxDuration = 300;

/**
 * 予測を作成し、工程ごとの進み具合を NDJSON で順に返す。
 * 最後に {type:"done", id} か {type:"error", message} を返して終わる。
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase が未設定です" }, { status: 503 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const parsed = AskSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PredictionEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await generatePrediction(supabase, {
          questionText: parsed.data.question,
          requestedMonths: parsed.data.months,
          parentPredictionId: parsed.data.parent,
          questionId: parsed.data.question_id ?? null,
          clarificationAnswer: parsed.data.clarification_answer ?? null,
          skipClarification: parsed.data.skip_clarification ?? false,
          onStage: (stage) => send({ type: "stage", stage }),
        });
        if (result.type === "clarify") {
          send({ type: "clarify", question_id: result.questionId, question: result.question, options: result.options });
        } else {
          revalidatePath("/");
          send({ type: "done", id: result.id });
        }
      } catch (error) {
        if (!(error instanceof AiError || error instanceof PredictionError)) console.error(error);
        send({
          type: "error",
          message: error instanceof AiError || error instanceof PredictionError ? error.message : "予測の作成中にエラーが発生しました。",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
