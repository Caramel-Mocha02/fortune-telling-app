import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, buttonClass, Card, formatDate, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import { latestVerdicts, themePerformance } from "@/lib/db/queries";
import type { CheckInRow, PredictionItemRow, PredictionRow } from "@/lib/db/types";
import { METHOD_GROUPS, METHODS } from "@/lib/divination/registry";
import {
  DIRECTION_LABELS,
  EVENT_TYPES,
  MAGNITUDE_LABELS,
  QUESTION_CATEGORY_LABELS,
  SPECIFICITY_LABELS,
  THEME_LABELS,
  VERDICT_LABELS,
  type QuestionCategory,
} from "@/lib/domain/taxonomy";
import { EVIDENCE_LABELS, type ThemePerformance } from "@/lib/evaluation/performance";
import { LABELS_JA } from "@/lib/evaluation/evaluate";
import type { RoutingDecision } from "@/lib/routing/router";
import type { EngineResult } from "@/lib/divination/types";
import type { TarotData } from "@/lib/divination/tarot/engine";

const SIGNAL_LABELS = { weak: "弱", moderate: "中", strong: "強" } as const;

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
              ? `過去の実績 (${THEME_LABELS[routing.personalization.theme]}) を占術の選択に反映しました。${routing.personalization.changes.join(" ／ ")}`
              : `${THEME_LABELS[routing.personalization.theme]}についての個人の実績がまだ少ないため、標準のルールで占術を選んでいます。`}
          </p>
        )}
        {routing && routing.skipped.length > 0 && (
          <p className="text-xs text-muted">
            今回使わなかった占術: {routing.skipped.map((s) => `${METHODS[s.method].label} (${s.reason})`).join("・")}
          </p>
        )}
      </Card>

      {sensitive && sensitive !== "none" && (
        <Card className="border-amber-300 text-sm">
          この質問は医療・法律・投資に関わる内容を含みます。占術の予測は判断の根拠にはならないため、必ず専門家に相談してください。
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

      <Section title="結論">
        <p className="leading-relaxed">{report.conclusion}</p>
      </Section>

      {report.agreements.length > 0 && (
        <Section title="複数の占術で一致していること">
          <ul className="space-y-2">
            {report.agreements.map((a, i) => {
              const groups = new Set(a.methods.map((m) => METHODS[m].group));
              return (
                <li key={i}>
                  {a.point}
                  <span className="ml-2 text-xs text-muted">
                    ({a.methods.map((m) => METHODS[m].label).join("・")} ／ 独立した系統 {groups.size})
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {report.differences.length > 0 && (
        <Section title="占術によって異なること">
          <dl className="space-y-2">
            {report.differences.map((d, i) => (
              <div key={i}>
                <dt className="text-sm font-medium">{METHODS[d.method].label}</dt>
                <dd className="text-sm">{d.emphasis}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="時期">
        <p className="leading-relaxed">{report.timing}</p>
      </Section>

      <Section title="検証する予測項目">
        <p className="mb-4 text-xs text-muted">
          この予測は保存時点で固定されています。後から書き換えることはできません。
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
                  <Badge>方向: {DIRECTION_LABELS[item.direction]}</Badge>
                  <Badge>規模: {MAGNITUDE_LABELS[item.magnitude]}</Badge>
                  <Badge>具体性: {SPECIFICITY_LABELS[item.specificity]}</Badge>
                </div>
                {/* 仕様 36: 占術上のシグナルと実績を分けて表示する */}
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted">占術上のシグナル</dt>
                    <dd>
                      {SIGNAL_LABELS[item.signal_strength]} ({item.independent_group_count} 系統)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">過去の個人データ ({THEME_LABELS[item.theme]})</dt>
                    <dd>{perf ? `${EVIDENCE_LABELS[perf.level]} (${perf.sample_count}件)` : "データ不足 (0件)"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">統計的検証</dt>
                    <dd>データ不足</dd>
                  </div>
                </dl>
                <details className="mt-2 text-xs text-muted">
                  <summary className="cursor-pointer">根拠</summary>
                  <p className="mt-1">{item.rationale}</p>
                  <p className="mt-1">支持: {item.supporting_methods.map((m) => METHODS[m].label).join("・") || "なし"}</p>
                </details>
                {fb && (
                  <div className="mt-3 rounded-md bg-background p-2 text-xs">
                    最新の回答: {VERDICT_LABELS[fb.verdict]} ({formatDate(fb.created_at)})
                    {ev && (
                      <span className="ml-2 text-muted">
                        {ev.evaluation_source === "ambiguous"
                          ? "／ 出来事の記録が紐付いていないため評価は「曖昧」扱い"
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

      <Section title="過去データとの比較">
        <p className="leading-relaxed">{report.past_data_note}</p>
      </Section>

      {(report.uncertainties.length > 0 || report.cautions.length > 0) && (
        <Section title="注意点">
          <ul className="list-disc space-y-1 pl-5">
            {[...report.uncertainties, ...report.cautions].map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </Section>
      )}

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
