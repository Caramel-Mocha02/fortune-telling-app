"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { DirectionSchema, EventTypeSchema, MagnitudeSchema, ThemeSchema } from "@/lib/domain/taxonomy";
import { structureEvent, type EventStructure } from "@/lib/ai/structure-event";
import { AiError } from "@/lib/ai/client";
import { findCandidates } from "@/lib/evaluation/match";
import type { PredictionItemRow } from "@/lib/db/types";

export async function suggestStructure(text: string): Promise<{ suggestion?: EventStructure; error?: string }> {
  await requireUser();
  const trimmed = text.trim();
  if (trimmed.length < 2) return { error: "出来事の内容を入力してください" };
  try {
    const { output } = await structureEvent(trimmed.slice(0, 2000));
    return { suggestion: output };
  } catch (error) {
    return { error: error instanceof AiError ? error.message : "分類に失敗しました" };
  }
}

const LogSchema = z.object({
  occurred_on: z.iso.date("日付を入力してください"),
  title: z.string().trim().min(1, "出来事を入力してください").max(200),
  description: z.string().trim().max(2000),
  theme: ThemeSchema,
  event_type: EventTypeSchema,
  direction: DirectionSchema,
  magnitude: MagnitudeSchema,
  ai_used: z.enum(["0", "1"]),
  ai_confidence: z.enum(["", "low", "medium", "high"]),
});

export interface MatchSuggestion {
  prediction_id: string;
  item_id: string;
  outcome_id: string;
  description: string;
  period: string;
}

export interface LogState {
  error?: string;
  ok?: number;
  /** 自動照合の候補 (確認されるまで評価としては保存しない) */
  suggestions?: MatchSuggestion[];
}

export async function addLifeEvent(prev: LogState, formData: FormData): Promise<LogState> {
  const { supabase } = await requireUser();
  const parsed = LogSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const { data: event, error } = await supabase
    .from("life_events")
    .insert({ occurred_on: d.occurred_on, category: d.theme, title: d.title, description: d.description || null })
    .select("id")
    .single();
  if (error) return { error: `保存に失敗しました: ${error.message}` };

  const { data: outcome, error: outcomeError } = await supabase.from("outcomes").insert({
    life_event_id: event.id,
    occurred_at: d.occurred_on,
    theme: d.theme,
    event_type: d.event_type,
    direction: d.direction,
    magnitude: d.magnitude,
    description: d.title,
    source: d.ai_used === "1" ? "ai_confirmed" : "user",
    confidence: d.ai_confidence || null,
  }).select("id").single();
  if (outcomeError) return { error: `構造化データの保存に失敗しました: ${outcomeError.message}` };

  // 自動照合: 進行中の予測の項目と突き合わせて候補を出す
  const { data: open } = await supabase.from("predictions").select("id").eq("status", "open");
  const openIds = (open ?? []).map((p) => p.id);
  let suggestions: MatchSuggestion[] = [];
  if (openIds.length > 0) {
    const { data: items } = await supabase.from("prediction_items").select("*").in("prediction_id", openIds);
    suggestions = findCandidates((items ?? []) as PredictionItemRow[], [{ ...d, occurred_at: d.occurred_on, id: outcome.id }]).map((c) => ({
      prediction_id: c.item.prediction_id,
      item_id: c.item.id,
      outcome_id: c.outcome.id,
      description: c.item.description,
      period: `${c.item.start_date} 〜 ${c.item.end_date}`,
    }));
  }

  revalidatePath("/log");
  revalidatePath("/");
  return { ok: (prev.ok ?? 0) + 1, suggestions };
}
