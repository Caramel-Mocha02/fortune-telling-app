import type { MetricSummary } from "@/lib/analytics/metrics";
import { EVIDENCE_LABELS } from "@/lib/evaluation/performance";

export const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** 指標の 1 行。データ不足なら数値を出さない (仕様 34 / 35) */
export function MetricCells({ m }: { m: MetricSummary }) {
  if (m.level === "insufficient") {
    return (
      <td colSpan={4} className="px-2 py-1.5 text-muted">
        データ不足 ({m.n}件)
      </td>
    );
  }
  return (
    <>
      <td className="px-2 py-1.5">{pct(m.timing_within_rate)}</td>
      <td className="px-2 py-1.5">{pct(m.event_match_rate)}</td>
      <td className="px-2 py-1.5">{pct(m.direction_match_rate)}</td>
      <td className="px-2 py-1.5 text-muted">
        {m.n}件・{EVIDENCE_LABELS[m.level]}
      </td>
    </>
  );
}

export function MetricHead({ first }: { first: string }) {
  return (
    <thead className="text-left text-xs text-muted">
      <tr>
        <th className="px-2 py-1.5 font-normal">{first}</th>
        <th className="px-2 py-1.5 font-normal">時期が期間内</th>
        <th className="px-2 py-1.5 font-normal">出来事が一致・類似</th>
        <th className="px-2 py-1.5 font-normal">方向が一致</th>
        <th className="px-2 py-1.5 font-normal">件数</th>
      </tr>
    </thead>
  );
}
