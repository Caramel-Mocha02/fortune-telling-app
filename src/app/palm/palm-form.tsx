"use client";
import { useActionState } from "react";
import { uploadPalm, type PalmState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { ErrorMessage } from "@/components/ui";

export function PalmForm({ today }: { today: string }) {
  const [state, action] = useActionState<PalmState, FormData>(uploadPalm, {});
  return (
    <form key={state.ok ?? 0} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="hand">手</label>
          <select id="hand" name="hand" defaultValue="right">
            <option value="right">右手</option>
            <option value="left">左手</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="captured_on">撮影日</label>
          <input id="captured_on" name="captured_on" type="date" defaultValue={today} max={today} required />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="image">手のひらの画像 (JPEG / PNG / WebP、5MB まで)</label>
        <input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" required />
        <p className="text-xs text-muted">明るい場所で、手のひら全体を正面から撮影してください。同じ条件で定期的に撮ると変化を比べやすくなります。</p>
      </div>
      <ErrorMessage message={state.error} />
      {state.ok ? <p className="text-sm text-accent">登録しました。</p> : null}
      <SubmitButton pendingText="画像を読み取っています…">登録する</SubmitButton>
    </form>
  );
}
