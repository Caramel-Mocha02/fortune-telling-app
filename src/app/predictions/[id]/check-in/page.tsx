import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import { latestVerdicts } from "@/lib/db/queries";
import type { OutcomeRow, PredictionItemRow, PredictionRow } from "@/lib/db/types";
import type { Verdict } from "@/lib/domain/taxonomy";
import { bestOutcomeByItem } from "@/lib/evaluation/match";
import { CheckInForm } from "./check-in-form";

export default async function CheckInPage({ params, searchParams }: PageProps<"/predictions/[id]/check-in">) {
  const { id } = await params;
  const sp = await searchParams;
  const checkInId = typeof sp.checkIn === "string" ? sp.checkIn : null;
  const { supabase } = await requireUser();

  const { data: prediction } = await supabase.from("predictions").select("*").eq("id", id).maybeSingle();
  if (!prediction) notFound();
  const p = prediction as PredictionRow;

  const [{ data: itemRows }, { data: outcomeRows }] = await Promise.all([
    supabase.from("prediction_items").select("*").eq("prediction_id", id).order("position"),
    // 予測作成日以降に起きた出来事だけを候補にする
    supabase.from("outcomes").select("*").gte("occurred_at", p.created_at.slice(0, 10)).order("occurred_at", { ascending: false }).limit(100),
  ]);
  const items = (itemRows ?? []) as PredictionItemRow[];
  const { feedback } = await latestVerdicts(supabase, items.map((i) => i.id));
  const lastVerdicts: Record<string, Verdict> = {};
  for (const [itemId, f] of feedback) lastVerdicts[itemId] = f.verdict;

  // 自動照合の候補を初期選択にする (ライフログからの遷移で指定があればそれを優先)
  const outcomes = (outcomeRows ?? []) as OutcomeRow[];
  const suggested = bestOutcomeByItem(items, outcomes);
  if (typeof sp.item === "string" && typeof sp.outcome === "string" && outcomes.some((o) => o.id === sp.outcome)) {
    suggested[sp.item] = sp.outcome;
  }

  return (
    <div className="space-y-6">
      <PageTitle sub="何も起きなかったことも大切なデータです。分からないものは「まだ分からない」を選んでください。">
        答え合わせ
      </PageTitle>
      <p className="text-sm">
        <Link href={`/predictions/${id}`} className="text-accent underline">
          ← 予測レポートに戻る
        </Link>
      </p>
      {(outcomeRows ?? []).length === 0 && (
        <Card className="text-sm">
          予測後の出来事がまだ記録されていません。起きたことがあれば、先に
          <Link href="/log" className="text-accent underline">ライフログ</Link>
          に記録すると、時期やテーマまで含めて照合できます。
        </Card>
      )}
      <CheckInForm
        predictionId={id}
        checkInId={checkInId}
        items={items}
        outcomes={outcomes}
        lastVerdicts={lastVerdicts}
        suggested={suggested}
      />
    </div>
  );
}
