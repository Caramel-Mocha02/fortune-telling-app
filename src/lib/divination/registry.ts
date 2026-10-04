import type { DivinationEngine, MethodId } from "./types";
import { westernAstrologyEngine } from "./western/engine";
import { fourPillarsEngine } from "./four-pillars/engine";
import { numerologyEngine } from "./numerology/engine";
import { kyuseiEngine } from "./kyusei/engine";
import { sanmeiEngine } from "./sanmei/engine";
import { ziWeiEngine } from "./zi-wei/engine";
import { tarotEngine } from "./tarot/engine";
import { palmistryEngine } from "./palmistry/engine";

/**
 * 相関グループ (仕様 19)。
 * 同じグループの占術は独立した「票」として数えない。
 */
export const METHOD_GROUPS = {
  western_astro: "西洋天体系",
  eastern_fate: "東洋命理系 (干支暦)",
  eastern_star: "東洋星命系",
  eastern_calendar: "東洋暦・方位系",
  numerology: "数秘系",
  divinatory: "卜術系",
  physiognomy: "相術系",
} as const;
export type MethodGroup = keyof typeof METHOD_GROUPS;

export interface MethodInfo {
  id: MethodId;
  label: string;
  group: MethodGroup;
  /** 実装済みフェーズ。未実装はルーターで除外し、スキップ理由を記録する。 */
  phase: 1 | 2 | 3;
}

export const METHODS: Record<MethodId, MethodInfo> = {
  western_astrology: { id: "western_astrology", label: "西洋占星術", group: "western_astro", phase: 1 },
  four_pillars: { id: "four_pillars", label: "四柱推命", group: "eastern_fate", phase: 1 },
  zi_wei_dou_shu: { id: "zi_wei_dou_shu", label: "紫微斗数", group: "eastern_star", phase: 2 },
  sanmei: { id: "sanmei", label: "算命学", group: "eastern_fate", phase: 2 },
  kyusei: { id: "kyusei", label: "九星気学", group: "eastern_calendar", phase: 2 },
  numerology: { id: "numerology", label: "数秘術", group: "numerology", phase: 2 },
  tarot: { id: "tarot", label: "タロット", group: "divinatory", phase: 3 },
  palmistry: { id: "palmistry", label: "手相", group: "physiognomy", phase: 3 },
};

export const ENGINES: Partial<Record<MethodId, DivinationEngine>> = {
  western_astrology: westernAstrologyEngine,
  four_pillars: fourPillarsEngine,
  zi_wei_dou_shu: ziWeiEngine,
  sanmei: sanmeiEngine,
  kyusei: kyuseiEngine,
  numerology: numerologyEngine,
  tarot: tarotEngine,
  palmistry: palmistryEngine,
};

export function isImplemented(method: MethodId): boolean {
  return ENGINES[method] !== undefined;
}

/** 使用占術を相関グループ単位にまとめる (独立票の数 = グループ数)。 */
export function groupMethods(methods: MethodId[]): Record<string, MethodId[]> {
  const groups: Record<string, MethodId[]> = {};
  for (const m of methods) {
    const g = METHODS[m].group;
    (groups[g] ??= []).push(m);
  }
  return groups;
}
