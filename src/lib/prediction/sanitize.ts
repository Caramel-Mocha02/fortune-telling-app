import type { PredictionItemDraft } from "@/lib/ai/interpret";
import type { MethodId, PredictionPeriod } from "@/lib/divination/types";
import { groupMethods } from "@/lib/divination/registry";

/** AI が返した予測項目を、予測期間と実際に使った占術の範囲に収める */
export function sanitizeItems(items: PredictionItemDraft[], period: PredictionPeriod, usedMethods: MethodId[]) {
  const clamp = (d: string) => (d < period.start ? period.start : d > period.end ? period.end : d);
  const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
  return items.map((item) => {
    let start = isDate(item.start_date) ? clamp(item.start_date) : period.start;
    let end = isDate(item.end_date) ? clamp(item.end_date) : period.end;
    if (end < start) [start, end] = [end, start];
    const supporting = [...new Set(item.supporting_methods.filter((m) => usedMethods.includes(m)))];
    return {
      ...item,
      start_date: start,
      end_date: end,
      supporting_methods: supporting,
      // 相関グループ単位で数えた独立な支持の数 (仕様 19)
      independent_group_count: Object.keys(groupMethods(supporting)).length,
    };
  });
}
