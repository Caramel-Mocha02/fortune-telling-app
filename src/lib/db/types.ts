import type { Direction, EventType, Magnitude, Specificity, Theme, Verdict } from "@/lib/domain/taxonomy";
import type { MethodId } from "@/lib/divination/types";
import type { Forecast } from "@/lib/ai/interpret";

/** supabase/migrations の列に対応する行の型 (読み取り用) */

export interface BirthProfileRow {
  user_id: string;
  birth_date: string;
  birth_time: string | null; // "HH:MM:SS"
  time_zone: string;
  place_name: string | null;
  latitude: number | null;
  longitude: number | null;
  gender: "female" | "male" | "unspecified";
  updated_at: string;
}

export interface QuestionRow {
  id: string;
  text: string;
  category: string | null;
  themes: Theme[];
  created_at: string;
}

export type ForecastReport = Omit<Forecast, "items">;

export interface PredictionRow {
  id: string;
  question_id: string;
  parent_prediction_id: string | null;
  created_at: string;
  prediction_period_start: string;
  prediction_period_end: string;
  category: string;
  methods: MethodId[];
  routing_version: string;
  prediction_model_version: string;
  ai_model: string;
  prompt_version: string;
  divination_engine_versions: Record<string, string>;
  summary: string;
  report: ForecastReport;
  status: "open" | "closed";
}

export interface PredictionItemRow {
  id: string;
  prediction_id: string;
  position: number;
  theme: Theme;
  event_type: EventType;
  direction: Direction;
  magnitude: Magnitude;
  specificity: Specificity;
  start_date: string;
  end_date: string;
  description: string;
  supporting_methods: MethodId[];
  independent_group_count: number;
  signal_strength: "weak" | "moderate" | "strong";
  rationale: string;
}

export interface CheckInRow {
  id: string;
  prediction_id: string;
  due_on: string;
  kind: "interim" | "final";
  completed_at: string | null;
}

export interface LifeEventRow {
  id: string;
  occurred_on: string;
  recorded_at: string;
  category: Theme;
  title: string;
  description: string | null;
}

export interface OutcomeRow {
  id: string;
  life_event_id: string | null;
  occurred_at: string;
  theme: Theme;
  event_type: EventType;
  direction: Direction;
  magnitude: Magnitude;
  description: string;
  source: "user" | "ai_confirmed";
  confidence: "low" | "medium" | "high" | null;
}

export interface FeedbackRow {
  id: string;
  prediction_item_id: string;
  check_in_id: string | null;
  verdict: Verdict;
  note: string | null;
  created_at: string;
}

export interface EvaluationRow {
  id: string;
  prediction_item_id: string;
  outcome_id: string | null;
  timing_label: string | null;
  timing_score: number | null;
  theme_label: string | null;
  theme_score: number | null;
  event_label: string;
  event_score: number;
  direction_label: string | null;
  direction_score: number | null;
  magnitude_label: string | null;
  magnitude_score: number | null;
  overall_score: number;
  evaluation_source: "user_confirmed" | "ai_estimated" | "ambiguous";
  evaluated_at: string;
}

export function birthDataFromRow(row: BirthProfileRow) {
  return {
    birthDate: row.birth_date,
    birthTime: row.birth_time ? row.birth_time.slice(0, 5) : null,
    timeZone: row.time_zone,
    placeName: row.place_name,
    latitude: row.latitude,
    longitude: row.longitude,
    gender: row.gender,
  };
}
