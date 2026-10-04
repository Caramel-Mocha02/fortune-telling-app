"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { addLifeEvent, suggestStructure, type LogState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass, ErrorMessage } from "@/components/ui";
import {
  DIRECTION_LABELS,
  DIRECTIONS,
  EVENT_TYPE_KEYS,
  EVENT_TYPES,
  MAGNITUDE_LABELS,
  MAGNITUDES,
  THEME_LABELS,
  THEMES,
  type Direction,
  type EventType,
  type Magnitude,
  type Theme,
} from "@/lib/domain/taxonomy";

interface Structure {
  theme: Theme;
  event_type: EventType;
  direction: Direction;
  magnitude: Magnitude;
}
const EMPTY: Structure = { theme: "career", event_type: "other", direction: "change", magnitude: "medium" };

export function LogForm({ today }: { today: string }) {
  const [state, action] = useActionState<LogState, FormData>(addLifeEvent, {});
  return (
    <>
      <LogFormInner key={state.ok ?? 0} today={today} state={state} action={action} />
      {state.suggestions && state.suggestions.length > 0 && (
        <div className="mt-4 space-y-2 rounded-lg border border-accent p-3 text-sm">
          <p className="font-medium">この出来事に関係しそうな予測があります</p>
          <p className="text-xs text-muted">時期とテーマから自動で照合した候補です。当たったかどうかは答え合わせで確認してください。</p>
          <ul className="space-y-1">
            {state.suggestions.map((s) => (
              <li key={s.item_id}>
                <Link
                  href={`/predictions/${s.prediction_id}/check-in?item=${s.item_id}&outcome=${s.outcome_id}`}
                  className="text-accent underline"
                >
                  {s.description}
                </Link>
                <span className="ml-2 text-xs text-muted">{s.period}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function LogFormInner({ today, state, action }: { today: string; state: LogState; action: (fd: FormData) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [structure, setStructure] = useState<Structure>(EMPTY);
  const [ai, setAi] = useState<{ used: boolean; confidence: string; error?: string }>({ used: false, confidence: "" });
  const [pending, startTransition] = useTransition();

  const suggest = () =>
    startTransition(async () => {
      const r = await suggestStructure(`${title}\n${description}`);
      if (r.suggestion) {
        const { confidence, ...s } = r.suggestion;
        setStructure(s);
        setAi({ used: true, confidence });
      } else {
        setAi({ used: false, confidence: "", error: r.error });
      }
    });

  const set = <K extends keyof Structure>(key: K) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setStructure({ ...structure, [key]: e.target.value as Structure[K] });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ai_used" value={ai.used ? "1" : "0"} />
      <input type="hidden" name="ai_confidence" value={ai.confidence} />
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1">
          <label htmlFor="occurred_on">日付</label>
          <input id="occurred_on" name="occurred_on" type="date" required defaultValue={today} max={today} />
        </div>
        <div className="space-y-1">
          <label htmlFor="title">出来事</label>
          <input id="title" name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 上司から新しいプロジェクトを任された" />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="description">詳細 (任意)</label>
        <textarea id="description" name="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="space-y-2 rounded-lg bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">分類</p>
          <button type="button" onClick={suggest} disabled={pending || title.trim() === ""} className={buttonClass("secondary")}>
            {pending ? "分類中…" : "AIで分類案を作る"}
          </button>
        </div>
        {ai.used && <p className="text-xs text-muted">AI の分類案です (確からしさ: {ai.confidence})。必要なら修正してください。</p>}
        <ErrorMessage message={ai.error} />
        <div className="grid gap-2 sm:grid-cols-4">
          <select name="theme" value={structure.theme} onChange={set("theme")} aria-label="テーマ">
            {THEMES.map((t) => <option key={t} value={t}>{THEME_LABELS[t]}</option>)}
          </select>
          <select name="event_type" value={structure.event_type} onChange={set("event_type")} aria-label="出来事の種類">
            {EVENT_TYPE_KEYS.map((k) => <option key={k} value={k}>{EVENT_TYPES[k].label}</option>)}
          </select>
          <select name="direction" value={structure.direction} onChange={set("direction")} aria-label="方向">
            {DIRECTIONS.map((d) => <option key={d} value={d}>{DIRECTION_LABELS[d]}</option>)}
          </select>
          <select name="magnitude" value={structure.magnitude} onChange={set("magnitude")} aria-label="規模">
            {MAGNITUDES.map((m) => <option key={m} value={m}>規模: {MAGNITUDE_LABELS[m]}</option>)}
          </select>
        </div>
      </div>

      <ErrorMessage message={state.error} />
      {state.ok ? <p className="text-sm text-accent">記録しました。</p> : null}
      <SubmitButton>記録する</SubmitButton>
    </form>
  );
}
