"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, ErrorMessage } from "@/components/ui";
import type { PredictionEvent } from "@/lib/prediction/ask-schema";
import { FortuneWaiting } from "@/components/fortune-waiting";

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
/** サーバーから届く工程の順番 (待ち時間の画面の進み具合に使う) */
const STAGES: Stage[] = ["question", "classify", "compute", "interpret", "save"];

export function AskForm({ parentId, defaultQuestion }: { parentId: string | null; defaultQuestion: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [base, setBase] = useState<Record<string, unknown> | null>(null);
  const [clarify, setClarify] = useState<Extract<PredictionEvent, { type: "clarify" }> | null>(null);
  const [answer, setAnswer] = useState("");
  const running = startedAt !== null;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function run(body: Record<string, unknown>) {
    setError(null);
    setClarify(null);
    setStage(null);
    setStartedAt(Date.now());
    setNow(Date.now());
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("ndjson")) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "予測の作成を開始できませんでした。");
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
          if (event.type === "clarify") {
            // 仕様 8: 予測を作る前に 1 回だけ確認する
            setClarify(event);
            setAnswer("");
            setStartedAt(null);
            return;
          }
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

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { question: fd.get("question"), months: fd.get("months"), parent: fd.get("parent") };
    setBase(body);
    void run(body);
  }

  function answerClarification(value: string | null) {
    if (!base || !clarify) return;
    void run(
      value
        ? { ...base, question_id: clarify.question_id, clarification_answer: value }
        : { ...base, question_id: clarify.question_id, skip_clarification: true },
    );
  }

  const currentIndex = stage ? STAGES.indexOf(stage) : 0;

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
          disabled={running || clarify !== null}
          defaultValue={defaultQuestion}
          placeholder="例: 今後1年の仕事の流れを見てほしい / いつ恋人ができそう？"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="months">予測期間</label>
        <select id="months" name="months" defaultValue="auto" disabled={running || clarify !== null}>
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage message={error} />

      {clarify && !running ? (
        <div className="space-y-3 rounded-lg border border-accent p-4">
          <p className="text-sm font-medium">予測を作る前に確認させてください</p>
          <p>{clarify.question}</p>
          {clarify.options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {clarify.options.map((o) => (
                <button key={o} type="button" className={buttonClass("secondary")} onClick={() => answerClarification(o)}>
                  {o}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="自由に回答する"
              aria-label="確認の質問への回答"
              maxLength={500}
            />
            <button type="button" className={buttonClass()} disabled={answer.trim() === ""} onClick={() => answerClarification(answer.trim())}>
              回答する
            </button>
          </div>
          <button type="button" className="text-sm text-muted underline" onClick={() => answerClarification(null)}>
            このまま予測する
          </button>
        </div>
      ) : running ? (
        <FortuneWaiting stageIndex={currentIndex} elapsedSeconds={Math.floor((now - startedAt!) / 1000)} />
      ) : (
        <button type="submit" className={buttonClass()}>
          占ってみる
        </button>
      )}
    </form>
  );
}
