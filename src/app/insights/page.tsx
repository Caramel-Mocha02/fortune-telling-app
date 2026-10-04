import { Card, PageTitle } from "@/components/ui";
import { MetricCells, MetricHead, pct } from "@/components/metric";
import { requireUser } from "@/lib/supabase/server";
import { loadEvaluatedItems } from "@/lib/db/queries";
import { byMethodThemeHorizon, byVersion, chanceBaseline, HORIZON_LABELS, type Horizon } from "@/lib/analytics/metrics";
import { METHODS } from "@/lib/divination/registry";
import { THEME_LABELS, type Theme } from "@/lib/domain/taxonomy";
import type { MethodId } from "@/lib/divination/types";
import type { OutcomeRow } from "@/lib/db/types";
import { compareWithBaselines, COMPARISON_LABELS } from "@/lib/analytics/baselines";
import type { EvaluableItem } from "@/lib/evaluation/evaluate";
import { todayIn } from "@/lib/time/zoned";
import { loadKpiInput } from "@/lib/db/kpi-input";
import { computeKpis, type Ratio } from "@/lib/analytics/kpi";

export default async function InsightsPage() {
  const { supabase } = await requireUser();
  const [rows, { data: outcomes }, { data: global }, { data: modelItems }, { data: baselineItems }, { data: profile }] = await Promise.all([
    loadEvaluatedItems(supabase),
    supabase.from("outcomes").select("*"),
    supabase.from("method_performance").select("*").order("sample_count", { ascending: false }).limit(30),
    supabase.from("prediction_items").select("id, theme, event_type, direction, magnitude, start_date, end_date"),
    supabase.from("baseline_items").select("model_item_id, baseline, theme, event_type, direction, magnitude, start_date, end_date"),
    supabase.from("birth_profiles").select("time_zone").maybeSingle(),
  ]);
  const today = todayIn(profile?.time_zone ?? "Asia/Tokyo");
  const kpi = computeKpis(await loadKpiInput(supabase), today);

  // ベースラインと比べるのは、ベースラインが作られている予測項目だけ (導入前の予測は対象外)
  const withBaseline = new Set((baselineItems ?? []).map((b) => b.model_item_id));
  const comparison = compareWithBaselines(
    {
      model: ((modelItems ?? []) as Array<EvaluableItem & { id: string }>).filter((i) => withBaseline.has(i.id)),
      history: (baselineItems ?? []).filter((b) => b.baseline === "history") as EvaluableItem[],
      prior: (baselineItems ?? []).filter((b) => b.baseline === "prior") as EvaluableItem[],
    },
    (outcomes ?? []) as OutcomeRow[],
    today,
  );

  const cells = byMethodThemeHorizon(rows);
  const models = byVersion(rows, "prediction_model_version");
  const routings = byVersion(rows, "routing_version");
  const baseline = chanceBaseline(rows, (outcomes ?? []) as OutcomeRow[]);
  const confirmedCount = rows.filter((r) => r.evaluation.evaluation_source === "user_confirmed").length;
  const ambiguousCount = rows.filter((r) => r.evaluation.evaluation_source === "ambiguous").length;

  return (
    <div className="space-y-6">
      <PageTitle sub="過去の予測が現実とどの程度一致したかの記録です。将来の的中を保証するものではありません。">実績</PageTitle>

      <Card className="space-y-4">
        <h2 className="font-bold">検証の進み具合</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <RatioStat label="答え合わせ率" r={kpi.verification_rate} hint="確認時期が来た予測項目のうち回答済み" />
          <RatioStat label="評価カバレッジ" r={kpi.evaluation_coverage} hint="期間が終わった予測項目のうち評価済み" />
          <RatioStat label="リマインドへの回答" r={kpi.check_in_rate} hint="期日が来た答え合わせのうち完了" />
          <RatioStat label="再予測" r={kpi.reforecast_rate} hint="以前の予測をもとに作り直した予測の割合" />
          <RatioStat label="過去の予測の参照" r={kpi.reference_rate} hint="作成から1日以上経ってから開いた予測の割合" />
          <RatioStat label="継続 (直近6か月)" r={kpi.active_months} hint="予測・記録・答え合わせをした月" />
        </dl>
        <div>
          <h3 className="mb-1 text-sm font-bold">予測性能の推移 (予測を作った四半期ごと)</h3>
          {kpi.trend.quarters.length === 0 ? (
            <p className="text-sm text-muted">まだ評価済みの予測がありません。</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {kpi.trend.quarters.map((q) => (
                <li key={q.quarter}>
                  {q.quarter}: {q.level === "insufficient" ? `データ不足 (${q.n}件)` : `出来事が一致・類似 ${pct(q.event_match_rate)} (${q.n}件)`}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-muted">
            {
              {
                improved: "直近の四半期は、前の四半期より一致の割合が高くなっています (参考値)。",
                declined: "直近の四半期は、前の四半期より一致の割合が低くなっています (参考値)。",
                flat: "直近 2 四半期で一致の割合に大きな差はありません (参考値)。",
                insufficient: "改善しているかの判断には、評価が 10 件以上ある四半期が 2 つ必要です。",
              }[kpi.trend.direction]
            }
          </p>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-bold">月ごとの利用</h3>
          <ul className="grid grid-cols-3 gap-1 text-xs sm:grid-cols-6">
            {kpi.monthly.map((m) => (
              <li key={m.month} className="rounded-md bg-background p-2">
                <p className="text-muted">{m.month}</p>
                <p>予測 {m.predictions}</p>
                <p>出来事 {m.outcomes}</p>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card className="text-sm">
        評価済みの予測項目: 出来事を紐付けて確認したもの <b>{confirmedCount}</b> 件 ／ 紐付けのない「曖昧」{ambiguousCount} 件
        <p className="mt-1 text-xs text-muted">
          実績の計算には、出来事を紐付けて確認した評価だけを使います。10 件未満の指標は「データ不足」として数値を出しません。
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 font-bold">占術・テーマ・時間軸ごとの実績</h2>
        <p className="mb-3 text-xs text-muted">予測項目を支持した占術ごとに数えています (1 項目を複数の占術が支持していれば、それぞれに 1 件)。</p>
        {cells.length === 0 ? (
          <p className="text-sm text-muted">まだ評価済みの予測がありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <MetricHead first="占術 / テーマ / 時間軸" />
              <tbody>
                {cells.map((c) => (
                  <tr key={`${c.method}-${c.theme}-${c.horizon}`} className="border-t border-border">
                    <td className="px-2 py-1.5">
                      {METHODS[c.method].label} / {THEME_LABELS[c.theme]} / {HORIZON_LABELS[c.horizon]}
                    </td>
                    <MetricCells m={c} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 font-bold">偶然との比較</h2>
        <p className="mb-3 text-xs text-muted">
          評価済みの予測項目を、紐付けた出来事以外の記録済みの出来事すべてと機械的に照合した場合の一致度です。実際の一致がこれと変わらなければ、予測は偶然以上の情報を持っていない可能性があります。紐付けは本人が選んでいるため、実際の値は高めに出やすい点に注意してください。
        </p>
        {baseline.chance_mean_overall === null ? (
          <p className="text-sm text-muted">データ不足 (出来事を紐付けた評価が 10 件以上必要です)</p>
        ) : (
          <table className="text-sm">
            <tbody>
              <tr>
                <td className="pr-6 text-muted">出来事が一致・類似</td>
                <td className="pr-4">実際 {pct(baseline.actual.event_match_rate)}</td>
                <td>偶然 {pct(baseline.chance_event_match_rate)}</td>
              </tr>
              <tr>
                <td className="pr-6 text-muted">時期が期間内</td>
                <td className="pr-4">実際 {pct(baseline.actual.timing_within_rate)}</td>
                <td>偶然 {pct(baseline.chance_timing_within_rate)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 font-bold">単純な予測との比較</h2>
        <p className="mb-3 text-xs text-muted">
          予測を作るたびに、占術を使わない単純な予測 (過去のライフログだけ／年齢・季節だけ) を同じテーマ・同じ期間で作って保存しています。
          期間が終わった項目を、どれも同じ手順 (期間内に記録された出来事のうち最も一致したもの) で自動採点して比べます。
          占術による予測がこれらを上回らなければ、占術が単純な推測以上の情報を持っているとは言えません。
        </p>
        {!comparison.sufficient ? (
          <p className="text-sm text-muted">
            データ不足 (期間が終わった予測項目が {comparison.results.find((r) => r.group === "model")!.n} 件。10 件以上で表示します)
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-2 py-1.5 font-normal">予測の作り方</th>
                <th className="px-2 py-1.5 font-normal">出来事が一致・類似</th>
                <th className="px-2 py-1.5 font-normal">一致度の平均</th>
                <th className="px-2 py-1.5 font-normal">件数</th>
              </tr>
            </thead>
            <tbody>
              {comparison.results.map((r) => (
                <tr key={r.group} className="border-t border-border">
                  <td className="px-2 py-1.5">{COMPARISON_LABELS[r.group]}</td>
                  <td className="px-2 py-1.5">{pct(r.event_hit_rate)}</td>
                  <td className="px-2 py-1.5">{r.mean_overall === null ? "—" : r.mean_overall.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-muted">{r.n}件</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 font-bold">予測モデルの比較</h2>
        <p className="mb-3 text-xs text-muted">予測の作り方 (使う占術・ルーティング・プロンプト) を変えたことで一致が変わったかを確かめます。</p>
        <div className="space-y-4 overflow-x-auto">
          <table className="w-full text-sm">
            <MetricHead first="予測モデル" />
            <tbody>
              {models.map((m) => (
                <tr key={m.version} className="border-t border-border">
                  <td className="px-2 py-1.5">{m.version}</td>
                  <MetricCells m={m} />
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full text-sm">
            <MetricHead first="ルーティング" />
            <tbody>
              {routings.map((m) => (
                <tr key={m.version} className="border-t border-border">
                  <td className="px-2 py-1.5">{m.version}</td>
                  <MetricCells m={m} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-bold">全体の実績 (全ユーザー)</h2>
        <p className="mb-3 text-xs text-muted">個人のデータが少ないうちは、こちらを基準に占術を選びます。10 件以上のものだけ表示します。</p>
        {(global ?? []).length === 0 ? (
          <p className="text-sm text-muted">データ不足</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(global ?? []).map((g) => (
              <li key={`${g.method}-${g.theme}-${g.horizon}`}>
                {METHODS[g.method as MethodId]?.label ?? g.method} / {THEME_LABELS[g.theme as Theme] ?? g.theme} /{" "}
                {HORIZON_LABELS[g.horizon as Horizon]}: 出来事の一致度の平均 {Number(g.event_score).toFixed(2)} ({g.sample_count}件)
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function RatioStat({ label, r, hint }: { label: string; r: Ratio; hint: string }) {
  return (
    <div title={hint}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd>
        {pct(r.rate)} <span className="text-xs text-muted">({r.numerator}/{r.denominator})</span>
      </dd>
    </div>
  );
}
