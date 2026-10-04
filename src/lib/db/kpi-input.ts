import "server-only";
import type { Supabase } from "@/lib/supabase/server";
import type { KpiInput } from "@/lib/analytics/kpi";
import { loadEvaluatedItems } from "./queries";

/** KPI (仕様 56) の計算に必要な行をまとめて読む */
export async function loadKpiInput(supabase: Supabase): Promise<KpiInput> {
  const [evaluated, predictions, items, feedback, checkIns, outcomes, views] = await Promise.all([
    loadEvaluatedItems(supabase),
    supabase.from("predictions").select("id, created_at, parent_prediction_id"),
    supabase.from("prediction_items").select("id, prediction_id, end_date"),
    supabase.from("feedback").select("prediction_item_id, verdict, created_at"),
    supabase.from("check_ins").select("prediction_id, due_on, completed_at"),
    supabase.from("outcomes").select("recorded_at"),
    supabase.from("prediction_views").select("prediction_id, viewed_at"),
  ]);
  return {
    evaluated,
    predictions: predictions.data ?? [],
    items: items.data ?? [],
    feedback: feedback.data ?? [],
    checkIns: checkIns.data ?? [],
    outcomes: outcomes.data ?? [],
    views: views.data ?? [],
  };
}
