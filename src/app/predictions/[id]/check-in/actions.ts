"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { VerdictSchema } from "@/lib/domain/taxonomy";
import { buildEvaluation } from "@/lib/evaluation/check-in";
import type { CheckInRow, OutcomeRow, PredictionItemRow, PredictionRow } from "@/lib/db/types";
import { todayIn } from "@/lib/time/zoned";

export interface CheckInState {
  error?: string;
}

export async function submitCheckIn(predictionId: string, _prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const { supabase } = await requireUser();

  const [{ data: prediction }, { data: itemRows }, { data: profile }] = await Promise.all([
    supabase.from("predictions").select("*").eq("id", predictionId).maybeSingle(),
    supabase.from("prediction_items").select("*").eq("prediction_id", predictionId),
    supabase.from("birth_profiles").select("time_zone").maybeSingle(),
  ]);
  if (!prediction) return { error: "予測が見つかりません" };
  const items = (itemRows ?? []) as PredictionItemRow[];

  const checkInId = (formData.get("check_in_id") as string) || null;
  let checkIn: CheckInRow | null = null;
  if (checkInId) {
    const { data } = await supabase.from("check_ins").select("*").eq("id", checkInId).eq("prediction_id", predictionId).maybeSingle();
    checkIn = data as CheckInRow | null;
  }

  const today = todayIn(profile?.time_zone ?? "Asia/Tokyo");

  const outcomeIds = items.map((i) => formData.get(`outcome_${i.id}`)).filter((v): v is string => typeof v === "string" && v !== "");
  const outcomes = new Map<string, OutcomeRow>();
  if (outcomeIds.length > 0) {
    const { data } = await supabase.from("outcomes").select("*").in("id", outcomeIds);
    for (const o of (data ?? []) as OutcomeRow[]) outcomes.set(o.id, o);
  }

  const entries = [];
  for (const item of items) {
    const verdict = VerdictSchema.safeParse(formData.get(`verdict_${item.id}`));
    if (!verdict.success) continue;
    const outcomeId = formData.get(`outcome_${item.id}`) as string | null;
    const outcome = outcomeId ? (outcomes.get(outcomeId) ?? null) : null;
    const evaluation = buildEvaluation(item, { verdict: verdict.data, outcome }, today);
    entries.push({
      prediction_item_id: item.id,
      verdict: verdict.data,
      note: String(formData.get(`note_${item.id}`) ?? "").slice(0, 1000),
      outcome_id: evaluation && outcome ? outcome.id : null,
      evaluation,
    });
  }
  if (entries.length === 0) return { error: "少なくとも1つの予測項目に回答してください" };

  const isFinal = checkIn?.kind === "final" || today > (prediction as PredictionRow).prediction_period_end;
  const { error } = await supabase.rpc("record_check_in", {
    p: {
      check_in_id: checkIn && !checkIn.completed_at ? checkIn.id : null,
      close_prediction_id: isFinal ? predictionId : null,
      entries,
    },
  });
  if (error) return { error: `保存に失敗しました: ${error.message}` };

  revalidatePath("/");
  revalidatePath(`/predictions/${predictionId}`);
  redirect(`/predictions/${predictionId}`);
}
