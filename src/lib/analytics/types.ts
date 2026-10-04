import type { Direction, EventType, Magnitude, Theme, Verdict } from "@/lib/domain/taxonomy";
import type { MethodId } from "@/lib/divination/types";

/** 評価済み予測項目 1 件 (項目ごとの最新評価 + 予測のバージョン情報) */
export interface EvaluatedItem {
  item_id: string;
  prediction_id: string;
  theme: Theme;
  event_type: EventType;
  direction: Direction;
  magnitude: Magnitude;
  start_date: string;
  end_date: string;
  supporting_methods: MethodId[];
  prediction_created_at: string;
  period_days: number;
  prediction_model_version: string;
  routing_version: string;
  prompt_version: string;
  evaluation: {
    outcome_id: string | null;
    timing_score: number | null;
    theme_score: number | null;
    event_score: number;
    direction_score: number | null;
    magnitude_score: number | null;
    overall_score: number;
    evaluation_source: "user_confirmed" | "ai_estimated" | "ambiguous";
    evaluated_at: string;
  };
}

export interface ReviewInput {
  predictions: Array<{ id: string; created_at: string; category: string }>;
  items: Array<{ id: string; prediction_id: string; theme: Theme; start_date: string; end_date: string; supporting_methods: MethodId[] }>;
  /** 項目ごとの最新の回答 */
  verdicts: Record<string, Verdict>;
  evaluated: EvaluatedItem[];
  outcomes: Array<{ id: string; occurred_at: string; theme: Theme }>;
}
