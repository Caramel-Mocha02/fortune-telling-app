import Link from "next/link";
import { buttonClass, Card, formatDate, PageTitle } from "@/components/ui";
import { pct } from "@/components/metric";
import { requireUser } from "@/lib/supabase/server";
import { todayIn } from "@/lib/time/zoned";
import type { CheckInRow } from "@/lib/db/types";
import { loadKpiInput } from "@/lib/db/kpi-input";
import { computeKpis } from "@/lib/analytics/kpi";
import { stalePredictions } from "@/lib/prediction/reminders";

export default async function HomePage() {
  const { supabase } = await requireUser();
  const { data: profile } = await supabase.from("birth_profiles").select("time_zone").maybeSingle();

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageTitle sub="占術で仮説を立て、現実と照らし合わせ、検証を積み重ねます">ようこそ</PageTitle>
        <Card className="space-y-3">
          <p className="text-sm">はじめに、占術の計算に使う生年月日などを登録してください。</p>
          <Link href="/profile" className={buttonClass()}>
            プロフィールを登録する
          </Link>
        </Card>
      </div>
    );
  }

  const today = todayIn(profile.time_zone);
  const [{ data: due }, { data: open }, { data: items }, { data: feedback }, kpiInput, { data: recentRows }] = await Promise.all([
    supabase.from("check_ins").select("*, predictions(summary)").is("completed_at", null).lte("due_on", today).order("due_on"),
    supabase.from("predictions").select("id, created_at, prediction_period_start, status, summary").eq("status", "open"),
    supabase.from("prediction_items").select("id, prediction_id"),
    supabase.from("feedback").select("prediction_item_id, created_at"),
    loadKpiInput(supabase),
    supabase.from("predictions").select("id, created_at, summary").order("created_at", { ascending: false }).limit(5),
  ]);
  const dueRows = (due ?? []) as Array<CheckInRow & { predictions: { summary: string } | null }>;
  const stale = stalePredictions(
    {
      predictions: (open ?? []) as Parameters<typeof stalePredictions>[0]["predictions"],
      items: items ?? [],
      feedback: feedback ?? [],
      dueCheckInPredictionIds: new Set(dueRows.map((c) => c.prediction_id)),
    },
    today,
  );
  const kpi = computeKpis(kpiInput, today);
  const recent = recentRows ?? [];

  return (
    <div className="space-y-6">
      <PageTitle>ホーム</PageTitle>

      {dueRows.length > 0 && (
        <Card className="space-y-3 border-accent">
          <h2 className="font-bold">答え合わせの時期です</h2>
          <ul className="space-y-2 text-sm">
            {dueRows.map((c) => (
              <li key={c.id}>
                <Link href={`/predictions/${c.prediction_id}/check-in?checkIn=${c.id}`} className="text-accent underline">
                  {formatDate(c.due_on)} {c.kind === "final" ? "期間終了" : "中間確認"}: {c.predictions?.summary.slice(0, 60)}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 仕様 25: 何も起きなかったことも記録するため、定期的に尋ねる */}
      {stale.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-bold">最近、これらの予測に関係することは起きましたか？</h2>
          <p className="text-xs text-muted">何も起きていない場合も「起きなかった」「まだ分からない」と記録すると、検証の偏りを減らせます。</p>
          <ul className="space-y-2 text-sm">
            {stale.map((p) => (
              <li key={p.id}>
                <Link href={`/predictions/${p.id}/check-in`} className="text-accent underline">
                  {p.summary.slice(0, 60)}
                </Link>
                <span className="ml-2 text-xs text-muted">
                  {p.last_answered_at ? `最後の回答 ${formatDate(p.last_answered_at)}` : `${formatDate(p.created_at)} 作成・未回答`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="予測" value={String(kpiInput.predictions.length)} />
        <Stat label="記録した出来事" value={String(kpiInput.outcomes.length)} />
        <Stat label="答え合わせ率" value={pct(kpi.verification_rate.rate)} hint="確認時期が来た予測項目のうち回答済みの割合" />
        <Stat label="評価カバレッジ" value={pct(kpi.evaluation_coverage.rate)} hint="期間が終わった予測項目のうち評価済みの割合" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/ask" className={buttonClass()}>
          質問する
        </Link>
        <Link href="/log" className={buttonClass("secondary")}>
          出来事を記録する
        </Link>
      </div>

      {recent.length > 0 && (
        <Card>
          <h2 className="mb-2 font-bold">最近の予測</h2>
          <ul className="space-y-2 text-sm">
            {recent.map((p) => (
              <li key={p.id}>
                <Link href={`/predictions/${p.id}`} className="hover:underline">
                  <span className="text-muted">{formatDate(p.created_at)}</span> {p.summary}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3" title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
