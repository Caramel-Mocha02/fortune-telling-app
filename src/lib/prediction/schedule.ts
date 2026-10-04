/**
 * 予測期間の決定と答え合わせリマインドの日程 (仕様 13 / 29)。
 */
import type { QuestionCategory } from "@/lib/domain/taxonomy";
import type { PredictionPeriod } from "@/lib/divination/types";
import { addDays, addMonths, daysBetween, formatIsoDate, parseIsoDate } from "@/lib/time/zoned";

export const MIN_PERIOD_MONTHS = 1;
export const MAX_PERIOD_MONTHS = 36;

const DEFAULT_MONTHS: Partial<Record<QuestionCategory, number>> = {
  LIFE: 24,
  DECISION: 3,
  CURRENT_STATE: 3,
  TRAVEL: 6,
};

export function resolvePeriodMonths(
  category: QuestionCategory,
  requested: number | null,
  suggested: number | null,
): number {
  const months = requested ?? suggested ?? DEFAULT_MONTHS[category] ?? 12;
  return Math.min(MAX_PERIOD_MONTHS, Math.max(MIN_PERIOD_MONTHS, Math.round(months)));
}

export function periodFrom(today: string, months: number): PredictionPeriod {
  const start = parseIsoDate(today);
  return { start: today, end: formatIsoDate(addDays(addMonths(start, months), -1)) };
}

export interface CheckInPlan {
  due_on: string;
  kind: "interim" | "final";
}

/**
 * 1か月予測 → 2週間後・1か月後、6か月予測 → 3か月後・6か月後、1年予測 → 6か月後・1年後。
 * つまり中間点と終了時。1年を超える予測は 6 か月ごとに中間確認を追加する。
 */
export function planCheckIns(period: PredictionPeriod): CheckInPlan[] {
  const start = parseIsoDate(period.start);
  const end = parseIsoDate(period.end);
  const totalDays = daysBetween(start, end) + 1;
  const plans: CheckInPlan[] = [];

  if (totalDays > 400) {
    for (let m = 6; addMonths(start, m) < end; m += 6) {
      plans.push({ due_on: formatIsoDate(addMonths(start, m)), kind: "interim" });
    }
  } else {
    plans.push({ due_on: formatIsoDate(addDays(start, Math.floor(totalDays / 2))), kind: "interim" });
  }
  plans.push({ due_on: formatIsoDate(addDays(end, 1)), kind: "final" });
  return plans;
}
