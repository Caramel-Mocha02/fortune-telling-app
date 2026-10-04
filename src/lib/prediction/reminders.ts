/**
 * 定期的な確認 (仕様 25 / 28)。
 *
 * 当たったものだけが報告される選択バイアスを避けるため、答え合わせの期日とは別に、
 * しばらく回答のない進行中の予測について「何か起きましたか？」と尋ねる。
 */
import { addDays, formatIsoDate, parseIsoDate } from "@/lib/time/zoned";

export const STALE_DAYS = 30;

export interface ReminderInput {
  predictions: Array<{ id: string; created_at: string; prediction_period_start: string; status: "open" | "closed"; summary: string }>;
  items: Array<{ id: string; prediction_id: string }>;
  feedback: Array<{ prediction_item_id: string; created_at: string }>;
  /** 期日が来て未完了の答え合わせがある予測 (そちらで案内済み) */
  dueCheckInPredictionIds: Set<string>;
}

export function stalePredictions(input: ReminderInput, today: string, limit = 3) {
  const cutoff = formatIsoDate(addDays(parseIsoDate(today), -STALE_DAYS));
  const itemToPrediction = new Map(input.items.map((i) => [i.id, i.prediction_id]));
  const lastAnswer = new Map<string, string>();
  for (const f of input.feedback) {
    const pid = itemToPrediction.get(f.prediction_item_id);
    if (pid && (lastAnswer.get(pid) ?? "") < f.created_at) lastAnswer.set(pid, f.created_at);
  }
  return input.predictions
    .filter((p) => p.status === "open")
    .filter((p) => !input.dueCheckInPredictionIds.has(p.id))
    .filter((p) => p.created_at.slice(0, 10) <= cutoff && p.prediction_period_start <= today)
    .filter((p) => (lastAnswer.get(p.id) ?? "").slice(0, 10) <= cutoff)
    .map((p) => ({ ...p, last_answered_at: lastAnswer.get(p.id) ?? null }))
    .sort((a, b) => (a.last_answered_at ?? a.created_at).localeCompare(b.last_answered_at ?? b.created_at))
    .slice(0, limit);
}
