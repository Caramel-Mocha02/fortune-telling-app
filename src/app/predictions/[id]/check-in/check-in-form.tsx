"use client";
import { useActionState } from "react";
import { submitCheckIn, type CheckInState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { ErrorMessage, formatDate } from "@/components/ui";
import { EVENT_TYPES, VERDICT_LABELS, VERDICTS, type Verdict } from "@/lib/domain/taxonomy";
import type { OutcomeRow, PredictionItemRow } from "@/lib/db/types";

export function CheckInForm({
  predictionId,
  checkInId,
  items,
  outcomes,
  lastVerdicts,
  suggested,
}: {
  predictionId: string;
  checkInId: string | null;
  items: PredictionItemRow[];
  outcomes: OutcomeRow[];
  lastVerdicts: Record<string, Verdict>;
  suggested: Record<string, string>;
}) {
  const [state, action] = useActionState<CheckInState, FormData>(submitCheckIn.bind(null, predictionId), {});
  return (
    <form action={action} className="space-y-5">
      {checkInId && <input type="hidden" name="check_in_id" value={checkInId} />}
      {items.map((item) => (
        <fieldset key={item.id} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <legend className="px-1 text-xs text-muted">
            {formatDate(item.start_date)} 〜 {formatDate(item.end_date)}
          </legend>
          <p className="font-medium">{item.description}</p>
          <div className="flex flex-wrap gap-2">
            {VERDICTS.map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-1 rounded-full border border-border px-3 py-1 font-normal has-checked:border-accent has-checked:bg-accent-soft">
                <input type="radio" name={`verdict_${item.id}`} value={v} className="sr-only" defaultChecked={lastVerdicts[item.id] === v} />
                {VERDICT_LABELS[v]}
              </label>
            ))}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted" htmlFor={`outcome_${item.id}`}>
              該当するライフログの出来事 (起きた場合)
            </label>
            <select id={`outcome_${item.id}`} name={`outcome_${item.id}`} defaultValue={suggested[item.id] ?? ""}>
              <option value="">選択しない</option>
              {outcomes.map((o) => (
                <option key={o.id} value={o.id}>
                  {formatDate(o.occurred_at)} {o.description} ({EVENT_TYPES[o.event_type].label})
                  {suggested[item.id] === o.id ? " ← 自動照合の候補" : ""}
                </option>
              ))}
            </select>
            {suggested[item.id] && (
              <p className="text-xs text-muted">時期とテーマから自動で候補を選んでいます。違う場合は変更してください。</p>
            )}
          </div>
          <input name={`note_${item.id}`} placeholder="メモ (任意)" />
        </fieldset>
      ))}
      <ErrorMessage message={state.error} />
      <SubmitButton>回答を保存する</SubmitButton>
    </form>
  );
}
