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

/** 手相の再登録の目安 (仕様 4.8: 定期的に登録して状態の変化を比べる) */
export const PALM_REFRESH_DAYS = 90;

/** 最後の登録から PALM_REFRESH_DAYS 日以上経っていれば経過日数を返す。未登録なら案内しない */
export function palmRefreshDue(latestCapturedOn: string | null, today: string): number | null {
  if (!latestCapturedOn) return null;
  const days = Math.floor((parseIsoDate(today).getTime() - parseIsoDate(latestCapturedOn).getTime()) / 86400000);
  return days >= PALM_REFRESH_DAYS ? days : null;
}
