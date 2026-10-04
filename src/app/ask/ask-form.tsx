"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, ErrorMessage } from "@/components/ui";
import type { PredictionEvent } from "@/lib/prediction/ask-schema";

const PERIODS = [
  { value: "auto", label: "質問から自動で決める" },
  { value: "1", label: "1か月" },
  { value: "3", label: "3か月" },
  { value: "6", label: "6か月" },
  { value: "12", label: "1年" },
  { value: "24", label: "2年" },
  { value: "36", label: "3年" },
];

type Stage = Extract<PredictionEvent, { type: "stage" }>["stage"];
const STAGES: Array<{ id: Stage; label: string }> = [
  { id: "question", label: "質問を保存" },
  { id: "classify", label: "質問の内容を分類" },
  { id: "compute", label: "占術を計算" },
  { id: "interpret", label: "計算結果を AI が解釈 (1分ほどかかります)" },
  { id: "save", label: "予測を保存" },
];

export function AskForm({ parentId, defaultQuestion }: { parentId: string | null; defaultQuestion: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const running = startedAt !== null;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setStage(null);
    setStartedAt(Date.now());
    setNow(Date.now());
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: fd.get("question"), months: fd.get("months"), parent: fd.get("parent") }),
      });
      if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("ndjson")) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "予測の作成を開始できませんでした。");
      }
      // NDJSON を 1 行ずつ読む
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const event = JSON.parse(buffer.slice(0, nl)) as PredictionEvent;
          buffer = buffer.slice(nl + 1);
          if (event.type === "stage") setStage(event.stage);
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "done") {
            router.push(`/predictions/${event.id}`);
            return;
          }
        }
      }
      throw new Error("サーバーとの接続が途中で切れました。もう一度お試しください。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "予測の作成中にエラーが発生しました。");
      setStartedAt(null);
    }
  }

  const currentIndex = stage ? STAGES.findIndex((s) => s.id === stage) : -1;

  return (
    <form onSubmit={submit} className="space-y-4">
      {parentId && <input type="hidden" name="parent" value={parentId} />}
      <div className="space-y-1">
        <label htmlFor="question">質問</label>
        <textarea
          id="question"
          name="question"
          rows={4}
          required
          minLength={4}
          disabled={running}
          defaultValue={defaultQuestion}
          placeholder="例: 今後1年の仕事の流れを見てほしい / いつ恋人ができそう？"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="months">予測期間</label>
        <select id="months" name="months" defaultValue="auto" disabled={running}>
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage message={error} />

      {running ? (
        <div className="space-y-2 rounded-lg bg-background p-4" aria-live="polite">
          <ol className="space-y-1.5 text-sm">
            {STAGES.map((s, i) => (
              <li key={s.id} className={i <= currentIndex ? "" : "text-muted"}>
                {i < currentIndex ? "✓" : i === currentIndex ? "…" : "・"} {s.label}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">経過 {Math.floor((now - startedAt!) / 1000)} 秒 ・ この画面を閉じずにお待ちください</p>
        </div>
      ) : (
        <button type="submit" className={buttonClass()}>
          予測レポートを作る
        </button>
      )}
    </form>
  );
}
