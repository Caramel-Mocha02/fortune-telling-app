/**
 * ベースライン予測 (仕様 17)。占術を使わない単純な予測を、本物の予測と同時に作って固定保存する。
 *
 *   Baseline B (history): 本人の過去のライフログだけを使う
 *     → そのテーマで最も多かった出来事・方向・規模
 *   Baseline C (prior):   年齢・季節・一般的なライフイベントだけを使う
 *     → 年齢層ごとの典型的な出来事。日本の年度替わり (4 月) を含む期間の仕事は「役割の変化」
 *
 * どちらも予測項目と同じテーマ・同じ期間で作る。比べるのは「何が起きるか」の中身であり、
 * 占術が単純な推測以上の情報を持っているかを検証する。
 */
import type { Direction, EventType, Magnitude, Theme } from "@/lib/domain/taxonomy";

export const BASELINE_RULES_VERSION = "baseline_rules_v1";

export type BaselineKind = "history" | "prior";

export interface BaselineItem {
  position: number;
  baseline: BaselineKind;
  theme: Theme;
  event_type: EventType;
  direction: Direction;
  magnitude: Magnitude;
  start_date: string;
  end_date: string;
  basis: string;
}

interface ModelItem {
  theme: Theme;
  start_date: string;
  end_date: string;
}

interface PastOutcome {
  occurred_at: string;
  theme: Theme;
  event_type: EventType;
  direction: Direction;
  magnitude: Magnitude;
}

type AgeBand = "young" | "middle" | "senior";

/** 年齢層ごとの典型的な出来事 (一般的なライフイベントの素朴な事前分布) */
const PRIOR: Record<Theme, Record<AgeBand, EventType>> = {
  career: { young: "job_change", middle: "role_change", senior: "role_change" },
  money: { young: "income_increase", middle: "big_purchase", senior: "income_increase" },
  love: { young: "new_encounter", middle: "new_encounter", senior: "new_encounter" },
  marriage: { young: "engagement", middle: "marriage", senior: "family_event" },
  relationship: { young: "new_connection", middle: "new_connection", senior: "new_connection" },
  study: { young: "study_start", middle: "certification", senior: "study_start" },
  health: { young: "general_change", middle: "health_issue", senior: "health_issue" },
  move: { young: "relocation", middle: "relocation", senior: "relocation" },
  travel: { young: "travel_domestic", middle: "travel_domestic", senior: "travel_domestic" },
  family: { young: "family_event", middle: "family_event", senior: "family_event" },
  other: { young: "general_change", middle: "general_change", senior: "general_change" },
};

const NEGATIVE_EVENTS = new Set<EventType>(["job_loss", "income_decrease", "breakup", "divorce", "conflict", "health_issue"]);

export function defaultDirection(event: EventType): Direction {
  if (event === "general_change" || event === "other") return "change";
  return NEGATIVE_EVENTS.has(event) ? "negative" : "positive";
}

export function ageBand(birthDate: string, today: string): AgeBand {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
  return age < 30 ? "young" : age < 45 ? "middle" : "senior";
}

/** 期間に 4 月 1 日が含まれるか (日本の年度替わり) */
function containsFiscalYearStart(start: string, end: string): boolean {
  for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
    const d = `${y}-04-01`;
    if (d >= start && d <= end) return true;
  }
  return false;
}

function mode<T extends string>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) [best, bestCount] = [v, c];
  return best;
}

export function priorBaseline(item: ModelItem, position: number, band: AgeBand): BaselineItem {
  const seasonal = item.theme === "career" && containsFiscalYearStart(item.start_date, item.end_date);
  const event = seasonal ? "role_change" : PRIOR[item.theme][band];
  return {
    position,
    baseline: "prior",
    theme: item.theme,
    event_type: event,
    direction: defaultDirection(event),
    magnitude: "medium",
    start_date: item.start_date,
    end_date: item.end_date,
    basis: seasonal ? "年度替わり (4月) を含む期間の仕事" : `年齢層 ${band} の典型的な出来事`,
  };
}

export function historyBaseline(item: ModelItem, position: number, past: PastOutcome[], band: AgeBand): BaselineItem {
  const same = past.filter((o) => o.theme === item.theme);
  if (same.length === 0) {
    return { ...priorBaseline(item, position, band), baseline: "history", basis: "このテーマの記録がないため年齢・季節の推測で代用" };
  }
  return {
    position,
    baseline: "history",
    theme: item.theme,
    event_type: mode(same.map((o) => o.event_type))!,
    direction: mode(same.map((o) => o.direction))!,
    magnitude: mode(same.map((o) => o.magnitude))!,
    start_date: item.start_date,
    end_date: item.end_date,
    basis: `過去のライフログ ${same.length} 件で最も多かった出来事`,
  };
}

/** 予測時点より前の出来事だけを使う (後知恵を防ぐ) */
export function generateBaselines(items: ModelItem[], birthDate: string, today: string, outcomes: PastOutcome[]): BaselineItem[] {
  const band = ageBand(birthDate, today);
  const past = outcomes.filter((o) => o.occurred_at < today);
  return items.flatMap((item, i) => [historyBaseline(item, i, past, band), priorBaseline(item, i, band)]);
}
