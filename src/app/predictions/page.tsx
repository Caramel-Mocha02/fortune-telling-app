import Link from "next/link";
import { Badge, Card, formatDate, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import { EVENT_TYPES, QUESTION_CATEGORY_LABELS, THEME_LABELS, type QuestionCategory } from "@/lib/domain/taxonomy";
import type { OutcomeRow, PredictionItemRow, PredictionRow } from "@/lib/db/types";
import { todayIn } from "@/lib/time/zoned";

type Entry =
  | { kind: "prediction"; date: string; prediction: PredictionRow; items: PredictionItemRow[] }
  | { kind: "outcome"; date: string; outcome: OutcomeRow }
  | { kind: "today"; date: string };

/** 仕様 27 / 32: 予測と現実を 1 本の時間軸に並べる */
export default async function TimelinePage() {
  const { supabase } = await requireUser();
  const [{ data: predictions }, { data: items }, { data: outcomes }, { data: profile }] = await Promise.all([
    supabase.from("predictions").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("prediction_items").select("*").order("position"),
    supabase.from("outcomes").select("*").order("occurred_at", { ascending: false }).limit(200),
    supabase.from("birth_profiles").select("time_zone").maybeSingle(),
  ]);
  const itemsByPrediction = new Map<string, PredictionItemRow[]>();
  for (const i of (items ?? []) as PredictionItemRow[]) {
    itemsByPrediction.set(i.prediction_id, [...(itemsByPrediction.get(i.prediction_id) ?? []), i]);
  }
  const today = todayIn(profile?.time_zone ?? "Asia/Tokyo");

  const entries: Entry[] = [
    ...((predictions ?? []) as PredictionRow[]).map((p) => ({
      kind: "prediction" as const,
      date: p.created_at.slice(0, 10),
      prediction: p,
      items: itemsByPrediction.get(p.id) ?? [],
    })),
    ...((outcomes ?? []) as OutcomeRow[]).map((o) => ({ kind: "outcome" as const, date: o.occurred_at, outcome: o })),
    { kind: "today" as const, date: today },
  ].sort((a, b) => b.date.localeCompare(a.date));

  // 未来側: 今日以降に予測期間が始まる/続いている予測項目
  const upcoming = ((items ?? []) as PredictionItemRow[])
    .filter((i) => i.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <PageTitle sub="過去の予測と、実際に起きた出来事を時系列で比べられます">タイムライン</PageTitle>

      {upcoming.length > 0 && (
        <Card>
          <h2 className="mb-2 font-bold">これからの予測期間</h2>
          <ul className="space-y-1 text-sm">
            {upcoming.map((i) => (
              <li key={i.id}>
                <Link href={`/predictions/${i.prediction_id}`} className="hover:underline">
                  <span className="text-muted">
                    {formatDate(i.start_date)}〜{formatDate(i.end_date)}
                  </span>{" "}
                  {THEME_LABELS[i.theme]}: {i.description}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ol className="relative space-y-4 border-l border-border pl-5">
        {entries.map((e) =>
          e.kind === "today" ? (
            <li key="today" className="relative">
              <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-foreground" />
              <p className="text-sm font-bold">今日 {formatDate(e.date)}</p>
            </li>
          ) : e.kind === "prediction" ? (
            <li key={`p-${e.prediction.id}`} className="relative">
              <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
              <Link href={`/predictions/${e.prediction.id}`} className="block rounded-lg border border-border bg-surface p-3 hover:border-accent">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">{formatDate(e.date)}</span>
                  <Badge tone="accent">予測</Badge>
                  <Badge>{QUESTION_CATEGORY_LABELS[e.prediction.category as QuestionCategory] ?? e.prediction.category}</Badge>
                  {e.prediction.status === "closed" && <Badge>答え合わせ済み</Badge>}
                </div>
                <p className="mt-1 text-sm">{e.prediction.summary}</p>
                <ul className="mt-1 text-xs text-muted">
                  {e.items.map((i) => (
                    <li key={i.id}>
                      ・{formatDate(i.start_date)}〜{formatDate(i.end_date)} {i.description}
                    </li>
                  ))}
                </ul>
              </Link>
            </li>
          ) : (
            <li key={`o-${e.outcome.id}`} className="relative">
              <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <div className="rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">{formatDate(e.date)}</span>
                  <Badge>実際</Badge>
                  <Badge>{THEME_LABELS[e.outcome.theme]}</Badge>
                  <Badge>{EVENT_TYPES[e.outcome.event_type].label}</Badge>
                </div>
                <p className="mt-1 text-sm">{e.outcome.description}</p>
              </div>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
