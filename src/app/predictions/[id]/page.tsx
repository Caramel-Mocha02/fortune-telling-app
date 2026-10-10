import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, buttonClass, Card, formatDate, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import { latestVerdicts, themePerformance } from "@/lib/db/queries";
import type { CheckInRow, PredictionItemRow, PredictionRow } from "@/lib/db/types";
import { METHOD_GROUPS, METHODS } from "@/lib/divination/registry";
import {
  EVENT_TYPES,
  QUESTION_CATEGORY_LABELS,
  THEME_LABELS,
  VERDICT_LABELS,
  type QuestionCategory,
} from "@/lib/domain/taxonomy";
import type { ThemePerformance } from "@/lib/evaluation/performance";
import { LABELS_JA } from "@/lib/evaluation/evaluate";
import type { RoutingDecision } from "@/lib/routing/router";
import type { EngineResult } from "@/lib/divination/types";
import type { TarotData } from "@/lib/divination/tarot/engine";

const SIGNAL_LABELS = { weak: "弱め", moderate: "ふつう", strong: "強め" } as const;
const DIRECTION_BADGES = { positive: "うれしい変化", negative: "気をつけたいこと", change: "変化", stable: "今の状態が続く", unknown: null } as const;
const EVIDENCE_PLAIN = { insufficient: "まだ記録が少ない", weak: "少しずつ記録が集まっています", moderate: "記録が集まっています" } as const;

export default async function PredictionPage({ params }: PageProps<"/predictions/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: prediction } = await supabase.from("predictions").select("*").eq("id", id).maybeSingle();
  if (!prediction) notFound();
  const p = prediction as PredictionRow;

  const [{ data: itemRows }, { data: question }, { data: checkInRows }, { data: snapshot }, performance] = await Promise.all([
    supabase.from("prediction_items").select("*").eq("prediction_id", id).order("position"),
    supabase.from("questions").select("text, classification").eq("id", p.question_id).single(),
    supabase.from("check_ins").select("*").eq("prediction_id", id).order("due_on"),
    supabase.from("prediction_snapshots").select("payload->routing, payload->engine_results, payload_sha256").eq("prediction_id", id).single(),
    themePerformance(supabase),
    // 過去予測参照率 (仕様 56) のための閲覧記録。失敗してもページ表示は続ける
    supabase.from("prediction_views").insert({ prediction_id: id }).then(() => null),
  ]);
  const items = (itemRows ?? []) as PredictionItemRow[];
  const checkIns = (checkInRows ?? []) as CheckInRow[];
  const { feedback, evaluations } = await latestVerdicts(supabase, items.map((i) => i.id));
  const routing = (snapshot?.routing ?? null) as RoutingDecision | null;
  const tarot = ((snapshot?.engine_results ?? []) as unknown as EngineResult[]).find((r) => r.method === "tarot") as
    | EngineResult<TarotData>
    | undefined;
  const sensitive = (question?.classification as { sensitive_domain?: string } | null)?.sensitive_domain;
  const clarification = (question?.classification as { clarification?: { question?: string; answer?: string } } | null)?.clarification;

  // 仕様 41: 以前の似た質問
  const { data: similar } = await supabase
    .from("predictions")
    .select("id, created_at, summary, questions(text)")
    .eq("category", p.category)
    .neq("id", id)
    .order("created_at", { ascending: false })
    .limit(3);

  const perfFor = (theme: string): ThemePerformance | undefined => performance.find((x) => x.theme === theme);
  const report = p.report;
  const nextCheckIn = checkIns.find((c) => !c.completed_at);

  return (
    <div className="space-y-6">
      <PageTitle sub={`${formatDate(p.created_at)} 作成 ・ 予測期間 ${formatDate(p.prediction_period_start)} 〜 ${formatDate(p.prediction_period_end)}`}>
        予測レポート
      </PageTitle>

      <Card className="space-y-3">
        <p className="text-sm text-muted">質問</p>
        <p>{question?.text}</p>
        {clarification?.question && clarification.answer && (
          <p className="text-sm text-muted">
            確認: {clarification.question} ／ 回答: {clarification.answer}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">{QUESTION_CATEGORY_LABELS[p.category as QuestionCategory] ?? p.category}</Badge>
          {p.methods.map((m) => (
            <Badge key={m}>
              {METHODS[m].label} ・ {METHOD_GROUPS[METHODS[m].group]}
            </Badge>
          ))}
          {p.status === "closed" && <Badge>答え合わせ完了</Badge>}
        </div>
        {routing?.personalization && (
          <p className="text-xs text-muted">
            {routing.personalization.applied
              ? `これまでの答え合わせ (${THEME_LABELS[routing.personalization.theme]}) をもとに、あなたに合う占いを優先しました。`
              : `${THEME_LABELS[routing.personalization.theme]}の答え合わせがまだ少ないので、おすすめの組み合わせで占っています。`}
          </p>
        )}
        {routing && routing.skipped.length > 0 && (
          <p className="text-xs text-muted">
            今回使わなかった占い: {routing.skipped.map((s) => `${METHODS[s.method].label} (${s.reason})`).join("・")}
          </p>
        )}
      </Card>

      {sensitive && sensitive !== "none" && (
        <Card className="border-amber-300 text-sm">
          この質問は医療・法律・投資に関わる内容を含みます。占いの結果は判断の根拠にはならないため、必ず専門家に相談してください。
        </Card>
      )}

      {tarot && (
        <Section title="引いたカード">
          <ul className="grid gap-3 sm:grid-cols-3">
            {tarot.data.cards.map((c) => (
              <li key={c.position} className="rounded-lg border border-border p-3 text-sm">
                <p className="text-xs text-muted">{c.position}</p>
                <p className="font-medium">
                  {c.name}
                  <span className="ml-1 text-xs text-muted">{c.orientation}</span>
                </p>
                <p className="mt-1 text-xs text-muted">{c.keywords}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="占いの結果">
        <p className="leading-relaxed">{report.conclusion}</p>
      </Section>

      {report.agreements.length > 0 && (
        <Section title="いくつかの占いで共通していること">
          <ul className="space-y-2">
            {report.agreements.map((a, i) => {
              return (
                <li key={i}>
                  {a.point}
                  <span className="ml-2 text-xs text-muted">
                    ({a.methods.map((m) => METHODS[m].label).join("・")})
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="これから起きそうなこと">
        <p className="mb-4 text-xs text-muted">
          この内容は占った時点のまま残り、あとから書き換えることはできません。期間が来たら答え合わせをしてみましょう。
        </p>
        <ul className="space-y-4">
          {items.map((item) => {
            const fb = feedback.get(item.id);
            const ev = evaluations.get(item.id);
            const perf = perfFor(item.theme);
            return (
              <li key={item.id} className="rounded-lg border border-border p-4">
                <p className="font-medium">{item.description}</p>
                <p className="mt-1 text-sm text-muted">
                  {formatDate(item.start_date)} 〜 {formatDate(item.end_date)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge>{THEME_LABELS[item.theme]}</Badge>
                  <Badge>{EVENT_TYPES[item.event_type].label}</Badge>
                  {DIRECTION_BADGES[item.direction] && <Badge>{DIRECTION_BADGES[item.direction]}</Badge>}
                </div>
                {/* 仕様 36: 占いの示し方と、これまでの当たり具合を分けて表示する */}
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted">占いの示し方</dt>
                    <dd>
                      {SIGNAL_LABELS[item.signal_strength]}
                      {item.independent_group_count >= 2 && ` (${item.independent_group_count} 種類の占いが同じことを示しています)`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">これまでの当たり具合 ({THEME_LABELS[item.theme]})</dt>
                    <dd>{perf ? `${EVIDENCE_PLAIN[perf.level]} (${perf.sample_count}件)` : "まだ記録が少ない (0件)"}</dd>
                  </div>
                </dl>
                <details className="mt-2 text-xs text-muted">
                  <summary className="cursor-pointer">どの占いからそう読めたか</summary>
                  <p className="mt-1">{item.rationale}</p>
                  <p className="mt-1">示した占い: {item.supporting_methods.map((m) => METHODS[m].label).join("・") || "なし"}</p>
                </details>
                {fb && (
                  <div className="mt-3 rounded-md bg-background p-2 text-xs">
                    最新の回答: {VERDICT_LABELS[fb.verdict]} ({formatDate(fb.created_at)})
                    {ev && (
                      <span className="ml-2 text-muted">
                        {ev.evaluation_source === "ambiguous"
                          ? "／ ライフログの出来事と結びつけると、より正確に答え合わせできます"
                          : `／ 時期: ${ev.timing_label ? LABELS_JA.timing[ev.timing_label as keyof typeof LABELS_JA.timing] : "—"} ・ イベント: ${LABELS_JA.event[ev.event_label as keyof typeof LABELS_JA.event]}`}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="これまでの答え合わせから">
        <p className="leading-relaxed">{report.past_data_note}</p>
      </Section>

      {report.actions.length > 0 && (
        <Section title="今できること">
          <ul className="list-disc space-y-1 pl-5">
            {report.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Section>
      )}

      <Card className="space-y-3">
        <h2 className="font-bold">答え合わせ</h2>
        <ul className="text-sm">
          {checkIns.map((c) => (
            <li key={c.id}>
              {formatDate(c.due_on)} {c.kind === "final" ? "期間終了後の確認" : "中間確認"}
              {c.completed_at ? " ✓" : ""}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/predictions/${id}/check-in${nextCheckIn ? `?checkIn=${nextCheckIn.id}` : ""}`}
            className={buttonClass()}
          >
            答え合わせをする
          </Link>
          <Link href={`/ask?reforecast=${id}`} className={buttonClass("secondary")}>
            再予測する
          </Link>
        </div>
      </Card>

      {similar && similar.length > 0 && (
        <Card className="space-y-2">
          <h2 className="font-bold">以前の似た質問</h2>
          <ul className="space-y-2 text-sm">
            {similar.map((s) => (
              <li key={s.id}>
                <Link href={`/predictions/${s.id}`} className="text-accent underline">
                  {formatDate(s.created_at)} 「{(s.questions as unknown as { text: string } | null)?.text}」
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-muted">
        {p.routing_version} ・ {p.prediction_model_version} ・ {p.prompt_version} ・ {p.ai_model} ・{" "}
        {Object.values(p.divination_engine_versions).join(" ・ ")} ・ snapshot {snapshot?.payload_sha256?.slice(0, 12)}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 font-bold">{title}</h2>
      {children}
    </Card>
  );
}
