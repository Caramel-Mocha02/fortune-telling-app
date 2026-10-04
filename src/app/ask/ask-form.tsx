"use client";
import { useActionState } from "react";
import { askQuestion, type AskState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { ErrorMessage } from "@/components/ui";

const PERIODS = [
  { value: "auto", label: "質問から自動で決める" },
  { value: "1", label: "1か月" },
  { value: "3", label: "3か月" },
  { value: "6", label: "6か月" },
  { value: "12", label: "1年" },
  { value: "24", label: "2年" },
  { value: "36", label: "3年" },
];

export function AskForm({ parentId, defaultQuestion }: { parentId: string | null; defaultQuestion: string }) {
  const [state, action] = useActionState<AskState, FormData>(askQuestion, {});
  return (
    <form action={action} className="space-y-4">
      {parentId && <input type="hidden" name="parent" value={parentId} />}
      <div className="space-y-1">
        <label htmlFor="question">質問</label>
        <textarea
          id="question"
          name="question"
          rows={4}
          required
          defaultValue={defaultQuestion}
          placeholder="例: 今後1年の仕事の流れを見てほしい / いつ恋人ができそう？"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="months">予測期間</label>
        <select id="months" name="months" defaultValue="auto">
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage message={state.error} />
      <SubmitButton pendingText="計算と解釈を行っています… (1〜2分かかることがあります)">予測レポートを作る</SubmitButton>
    </form>
  );
}
