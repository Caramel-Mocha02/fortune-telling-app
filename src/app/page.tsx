import Link from "next/link";
import { buttonClass, Card, formatDate, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import { todayIn } from "@/lib/time/zoned";
import type { CheckInRow } from "@/lib/db/types";

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
  const [{ data: due }, { count: predictionCount }, { data: items }, { data: feedbackRows }, { data: evalRows }, { count: outcomeCount }, { data: recent }] =
    await Promise.all([
      supabase
        .from("check_ins")
        .select("*, predictions(summary)")
        .is("completed_at", null)
        .lte("due_on", today)
        .order("due_on"),
      supabase.from("predictions").select("id", { count: "exact", head: true }),
      supabase.from("prediction_items").select("id, start_date, end_date"),
      supabase.from("feedback").select("prediction_item_id, verdict"),
      supabase.from("prediction_evaluations").select("prediction_item_id"),
      supabase.from("outcomes").select("id", { count: "exact", head: true }),
      supabase.from("predictions").select("id, created_at, summary").order("created_at", { ascending: false }).limit(5),
    ]);

  // 仕様 56 Primary KPI
  const allItems = items ?? [];
  const answered = new Set((feedbackRows ?? []).filter((f) => f.verdict !== "pending").map((f) => f.prediction_item_id));
  const evaluated = new Set((evalRows ?? []).map((e) => e.prediction_item_id));
  const ended = allItems.filter((i) => i.end_date < today);
  const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);

  return (
    <div className="space-y-6">
      <PageTitle>ホーム</PageTitle>

      {(due ?? []).length > 0 && (
        <Card className="space-y-3 border-accent">
          <h2 className="font-bold">答え合わせの時期です</h2>
          <ul className="space-y-2 text-sm">
            {((due ?? []) as Array<CheckInRow & { predictions: { summary: string } | null }>).map((c) => (
              <li key={c.id}>
                <Link href={`/predictions/${c.prediction_id}/check-in?checkIn=${c.id}`} className="text-accent underline">
                  {formatDate(c.due_on)} {c.kind === "final" ? "期間終了" : "中間確認"}: {c.predictions?.summary.slice(0, 60)}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="予測" value={String(predictionCount ?? 0)} />
        <Stat label="記録した出来事" value={String(outcomeCount ?? 0)} />
        <Stat label="答え合わせ率" value={pct(answered.size, allItems.length)} hint="回答済みの予測項目 / 全予測項目" />
        <Stat label="評価カバレッジ" value={pct([...evaluated].filter((id) => ended.some((i) => i.id === id)).length, ended.length)} hint="期間終了した項目のうち評価済みの割合" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/ask" className={buttonClass()}>
          質問する
        </Link>
        <Link href="/log" className={buttonClass("secondary")}>
          出来事を記録する
        </Link>
      </div>

      {(recent ?? []).length > 0 && (
        <Card>
          <h2 className="mb-2 font-bold">最近の予測</h2>
          <ul className="space-y-2 text-sm">
            {(recent ?? []).map((p) => (
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
