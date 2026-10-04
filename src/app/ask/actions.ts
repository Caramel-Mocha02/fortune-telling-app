"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { generatePrediction, PredictionError } from "@/lib/prediction/pipeline";
import { AiError } from "@/lib/ai/client";

const AskSchema = z.object({
  question: z.string().trim().min(4, "質問をもう少し具体的に書いてください").max(2000),
  months: z.preprocess((v) => (v === "auto" || v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(36).nullable()),
  parent: z.preprocess((v) => (v === "" || v == null ? null : v), z.uuid().nullable()),
});

export interface AskState {
  error?: string;
}

export async function askQuestion(_prev: AskState, formData: FormData): Promise<AskState> {
  const { supabase } = await requireUser();
  const parsed = AskSchema.safeParse({
    question: formData.get("question"),
    months: formData.get("months"),
    parent: formData.get("parent"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let predictionId: string;
  try {
    predictionId = await generatePrediction(supabase, {
      questionText: parsed.data.question,
      requestedMonths: parsed.data.months,
      parentPredictionId: parsed.data.parent,
    });
  } catch (error) {
    if (error instanceof AiError || error instanceof PredictionError) return { error: error.message };
    console.error(error);
    return { error: "予測の生成中にエラーが発生しました。" };
  }
  revalidatePath("/");
  redirect(`/predictions/${predictionId}`);
}
