/**
 * 手相 エンジン v1
 *
 * 登録済みの観察結果 (画像から抽出済み) を手ごとに集計し、
 * 最新の状態と前回登録からの変化を決定的に比較する。画像は再解析しない。
 * 手相は「現在の状態・傾向と、その変化」を示すものとして扱い、長期の時期予測には使わない。
 */
import type { DivinationEngine, EngineInput, EngineResult } from "../types";
import { LINE_LABELS, PalmObservationSchema, type PalmObservation } from "./observation";

export const PALMISTRY_ENGINE_VERSION = "palmistry_engine_v1";

const LENGTH_RANK = { short: 0, medium: 1, long: 2, unknown: null } as const;
const DEPTH_RANK = { faint: 0, moderate: 1, deep: 2, unknown: null } as const;

export interface LineChange {
  line: string;
  change: string;
}

export function compareObservations(prev: PalmObservation, next: PalmObservation): LineChange[] {
  const changes: LineChange[] = [];
  for (const key of Object.keys(LINE_LABELS) as Array<keyof PalmObservation["lines"]>) {
    const a = prev.lines[key];
    const b = next.lines[key];
    const label = LINE_LABELS[key];
    if (a.visible !== b.visible) {
      changes.push({ line: label, change: b.visible ? "見えるようになった" : "見えにくくなった" });
      continue;
    }
    if (!a.visible) continue;
    const la = LENGTH_RANK[a.length];
    const lb = LENGTH_RANK[b.length];
    if (la !== null && lb !== null && la !== lb) changes.push({ line: label, change: lb > la ? "長くなった" : "短くなった" });
    const da = DEPTH_RANK[a.depth];
    const db = DEPTH_RANK[b.depth];
    if (da !== null && db !== null && da !== db) changes.push({ line: label, change: db > da ? "濃くなった" : "薄くなった" });
    for (const f of b.features.filter((x) => !a.features.includes(x))) changes.push({ line: label, change: `特徴が現れた: ${f}` });
    for (const f of a.features.filter((x) => !b.features.includes(x))) changes.push({ line: label, change: `特徴が消えた: ${f}` });
  }
  return changes;
}

export interface PalmistryData {
  hands: Array<{
    hand: "left" | "right";
    latest: { reading_id: string; captured_on: string; observation: PalmObservation };
    previous: { reading_id: string; captured_on: string } | null;
    changes_since_previous: LineChange[];
  }>;
}

function compute(input: EngineInput): EngineResult<PalmistryData> {
  const caveats = ["手相は画像からの観察に基づく。照明・角度・画質により読み取りに誤差がある。"];
  const readings = (input.context?.palmReadings ?? [])
    .map((r) => ({ ...r, parsed: PalmObservationSchema.safeParse(r.observation) }))
    .filter((r) => r.parsed.success && r.parsed.data.usable)
    .sort((a, b) => b.captured_on.localeCompare(a.captured_on));

  const hands: PalmistryData["hands"] = [];
  for (const hand of ["left", "right"] as const) {
    const mine = readings.filter((r) => r.hand === hand);
    if (mine.length === 0) continue;
    const [latest, previous] = mine;
    hands.push({
      hand,
      latest: { reading_id: latest.id, captured_on: latest.captured_on, observation: latest.parsed.data! },
      previous: previous ? { reading_id: previous.id, captured_on: previous.captured_on } : null,
      changes_since_previous: previous ? compareObservations(previous.parsed.data!, latest.parsed.data!) : [],
    });
  }
  if (hands.length === 0) caveats.push("判別可能な手相画像が登録されていない。");

  return {
    method: "palmistry",
    engine_version: PALMISTRY_ENGINE_VERSION,
    settings: { comparison: "latest_vs_previous_per_hand", lines: "life,head,heart,fate,sun" },
    caveats,
    data: { hands },
  };
}

export const palmistryEngine: DivinationEngine<PalmistryData> = {
  method: "palmistry",
  version: PALMISTRY_ENGINE_VERSION,
  compute,
};
