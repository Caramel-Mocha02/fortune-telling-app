import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { pct } from "@/components/metric";
import { requireUser } from "@/lib/supabase/server";
import { loadEvaluatedItems } from "@/lib/db/queries";
import { buildReview, monthRange, yearRange } from "@/lib/analytics/review";
import { METHODS } from "@/lib/divination/registry";
import { THEME_LABELS, type Theme, type Verdict } from "@/lib/domain/taxonomy";
import type { MethodId } from "@/lib/divination/types";
import { todayIn } from "@/lib/time/zoned";

export default async function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const { data: profile } = await supabase.from("birth_profiles").select("time_zone").maybeSingle();
  const today = todayIn(profile?.time_zone ?? "Asia/Tokyo");

  const yearParam = typeof sp.year === "string" && /^\d{4}$/.test(sp.year) ? Number(sp.year) : null;
  const monthParam = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : null;
  const mode: "month" | "year" = yearParam ? "year" : "month";
  const [y, m] = (monthParam ?? today.slice(0, 7)).split("-").map(Number);
  const range = mode === "year" ? yearRange(yearParam!) : monthRange(y, m);

  const [evaluated, { data: predictions }, { data: items }, { data: feedback }, { data: outcomes }] = await Promise.all([
    loadEvaluatedItems(supabase),
    supabase.from("predictions").select("id, created_at, category"),
    supabase.from("prediction_items").select("id, prediction_id, theme, start_date, end_date, supporting_methods"),
    supabase.from("feedback").select("prediction_item_id, verdict, created_at").order("created_at", { ascending: false }),
    supabase.from("outcomes").select("id, occurred_at, theme"),
  ]);
  const verdicts: Record<string, Verdict> = {};
  for (const f of feedback ?? []) verdicts[f.prediction_item_id] ??= f.verdict as Verdict;

  const review = buildReview(
    {
      predictions: predictions ?? [],
      items: (items ?? []) as Parameters<typeof buildReview>[0]["items"],
      verdicts,
      evaluated,
      outcomes: (outcomes ?? []) as Parameters<typeof buildReview>[0]["outcomes"],
    },
    range,
  );

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const title = mode === "year" ? `${yearParam}年 予測レビュー` : `${y}年${m}月 予測レビュー`;
  const v = review.verification;

  return (
    <div className="space-y-6">
      <PageTitle sub="予測と現実の照合をふりかえります。数値は過去の一致の記録で、将来の的中率ではありません。">{title}</PageTitle>
      <nav className="flex flex-wrap gap-3 text-sm">
        {mode === "month" ? (
          <>
            <Link href={`/reviews?month=${shift(-1)}`} className="text-accent underline">← 前の月</Link>
            <Link href={`/reviews?month=${shift(1)}`} className="text-accent underline">次の月 →</Link>
            <Link href={`/reviews?year=${y}`} className="text-accent underline">{y}年の年次レビュー</Link>
          </>
        ) : (
          <>
            <Link href={`/reviews?year=${yearParam! - 1}`} className="text-accent underline">← {yearParam! - 1}年</Link>
            <Link href={`/reviews?year=${yearParam! + 1}`} className="text-accent underline">{yearParam! + 1}年 →</Link>
            <Link href="/reviews" className="text-accent underline">今月の月次レビュー</Link>
          </>
        )}
      </nav>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="予測した数" value={`${review.predictions_made}件`} sub={`予測項目 ${review.items_made}`} />
        <Stat label="記録した出来事" value={`${review.outcomes_recorded}件`} />
        <Stat label="評価済み (確認済み)" value={`${review.metrics.n}件`} />
      </div>

      <Card>
        <h2 className="mb-2 font-bold">検証</h2>
        <p className="mb-2 text-xs text-muted">この期間に予測期間が重なっていた項目の、最新の回答です。</p>
        <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <li>一致 <b>{v.match}</b></li>
          <li>部分一致 <b>{v.partial}</b></li>
          <li>不一致 <b>{v.mismatch}</b></li>
          <li>未評価 <b>{v.unevaluated}</b></li>
        </ul>
      </Card>

      <Card className="space-y-2 text-sm">
        <h2 className="font-bold">傾向</h2>
        {review.metrics.level === "insufficient" ? (
          <p className="text-muted">この期間に確認済みの評価が 10 件未満のため、一致率は表示しません。</p>
        ) : (
          <p>
            時期が期間内: {pct(review.metrics.timing_within_rate)} ／ 出来事が一致・類似: {pct(review.metrics.event_match_rate)} ／ 方向が一致:{" "}
            {pct(review.metrics.direction_match_rate)}
          </p>
        )}
        <p>
          最も一致したテーマ:{" "}
          {review.best_theme ? `${THEME_LABELS[review.best_theme.theme]} (${pct(review.best_theme.event_match_rate)}、${review.best_theme.n}件)` : "データ不足"}
        </p>
        <p>
          最も一致した占術:{" "}
          {review.best_method
            ? `${METHODS[review.best_method.method as MethodId].label} (${pct(review.best_method.event_match_rate)}、${review.best_method.n}件)`
            : "データ不足"}
        </p>
        {review.insufficient_themes.length > 0 && (
          <p className="text-muted">データ不足: {review.insufficient_themes.map((t: Theme) => THEME_LABELS[t]).join("・")}</p>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
