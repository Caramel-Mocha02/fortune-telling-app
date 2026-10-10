"use client";
import { useState } from "react";
import { uploadPalm } from "@/app/palm/actions";
import { buttonClass, ErrorMessage } from "@/components/ui";
import { HandIcon } from "@/components/icons";

/**
 * 手相を使う占いになったときに、その場で手相を登録してもらう (事前登録は不要)。
 * reason=stale は前回の登録から時間が経っている場合。
 */
export function PalmPrompt({
  reason,
  daysSince,
  onContinue,
}: {
  reason: "none" | "stale";
  daysSince: number | null;
  onContinue: (decision: "skip" | "use_existing") => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const d = new Date();
    fd.set("captured_on", `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    const result = await uploadPalm({}, fd);
    setPending(false);
    if (result.error) return setError(result.error);
    onContinue("use_existing");
  }

  return (
    <div className="space-y-4 rounded-2xl border border-accent bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <HandIcon className="h-6 w-6" />
        </span>
        <div>
          <p className="font-medium">この占いでは手相も見ます</p>
          <p className="mt-1 text-sm text-muted">
            {reason === "none"
              ? "今のあなたの状態を読むために、手のひらの写真を1枚登録してください。"
              : `前回の手相の登録から ${daysSince} 日経っています。撮り直すと、前回からの変化も読めます。`}
          </p>
        </div>
      </div>

      <form onSubmit={upload} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <select name="hand" defaultValue="right" aria-label="手" disabled={pending}>
            <option value="right">右手</option>
            <option value="left">左手</option>
          </select>
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required disabled={pending} aria-label="手のひらの写真" />
        </div>
        <p className="text-xs text-muted">明るい場所で、手のひら全体を正面から撮影してください (JPEG・PNG・WebP、5MB まで)。</p>
        <ErrorMessage message={error} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonClass()} disabled={pending}>
            {pending ? "手相を読み取っています…" : "登録して占う"}
          </button>
          {reason === "stale" && (
            <button type="button" className={buttonClass("secondary")} disabled={pending} onClick={() => onContinue("use_existing")}>
              前回の手相で占う
            </button>
          )}
          <button type="button" className="text-sm text-muted underline" disabled={pending} onClick={() => onContinue("skip")}>
            手相なしで占う
          </button>
        </div>
      </form>
    </div>
  );
}
