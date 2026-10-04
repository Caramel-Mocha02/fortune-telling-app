/**
 * 九星気学 計算エンジン v1
 *
 * - 本命星: 立春で切り替わる年の九星
 * - 月命星: 節入りで切り替わる月の九星
 * - 年盤・月盤: 後天定位盤の飛泊順 (中宮→乾→兌→艮→離→坎→坤→震→巽) で配置
 * - 方位: 五黄殺・暗剣殺・本命殺・本命的殺・歳破/月破を凶方とし、
 *         本命星と相生・比和の星が回る方位を吉方とする (月命星は考慮しない)
 */
import type { DivinationEngine, EngineInput, EngineResult } from "../types";
import { adjacentJie, monthPillarAt, yearPillarAt } from "../four-pillars/engine";
import { fromZoned, parseIsoDate, todayIn } from "@/lib/time/zoned";

export const KYUSEI_ENGINE_VERSION = "kyusei_engine_v1";

export const STARS = ["一白水星", "二黒土星", "三碧木星", "四緑木星", "五黄土星", "六白金星", "七赤金星", "八白土星", "九紫火星"] as const;
const STAR_ELEMENT = ["water", "earth", "wood", "wood", "earth", "metal", "metal", "earth", "fire"] as const;
const GENERATES: Record<string, string> = { wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood" };

/** 飛泊順の宮 */
const PALACES = [
  { id: "center", ja: "中宮" },
  { id: "NW", ja: "北西 (乾)" },
  { id: "W", ja: "西 (兌)" },
  { id: "NE", ja: "北東 (艮)" },
  { id: "S", ja: "南 (離)" },
  { id: "N", ja: "北 (坎)" },
  { id: "SW", ja: "南西 (坤)" },
  { id: "E", ja: "東 (震)" },
  { id: "SE", ja: "南東 (巽)" },
] as const;
type PalaceId = (typeof PALACES)[number]["id"];
const OPPOSITE: Record<PalaceId, PalaceId> = { center: "center", NW: "SE", SE: "NW", W: "E", E: "W", NE: "SW", SW: "NE", S: "N", N: "S" };
const BRANCH_DIRECTION: PalaceId[] = ["N", "NE", "NE", "E", "SE", "SE", "S", "SW", "SW", "W", "NW", "NW"];
const palaceJa = (id: PalaceId) => PALACES.find((p) => p.id === id)!.ja;

const wrap9 = (n: number) => ((((n - 1) % 9) + 9) % 9) + 1;

/** 年の九星 (= 年盤の中宮星)。solarYear は立春基準の年 */
export function yearStar(solarYear: number): number {
  return wrap9(11 - (solarYear % 9));
}

/** 月の九星 (= 月盤の中宮星)。monthOffset は寅月 = 0 */
export function monthStar(yearStarNumber: number, monthOffset: number): number {
  const base = [1, 4, 7].includes(yearStarNumber) ? 8 : [3, 6, 9].includes(yearStarNumber) ? 5 : 2;
  return wrap9(base - monthOffset);
}

/** 盤上で star がいる宮 */
export function palaceOf(center: number, star: number): PalaceId {
  return PALACES[(((star - center) % 9) + 9) % 9].id;
}

function goodStars(honmei: number): number[] {
  const e = STAR_ELEMENT[honmei - 1];
  return [1, 2, 3, 4, 6, 7, 8, 9].filter((s) => {
    if (s === honmei) return false;
    const se = STAR_ELEMENT[s - 1];
    return se === e || GENERATES[se] === e || GENERATES[e] === se;
  });
}

export interface BoardReading {
  center_star: string;
  honmei_palace: string;
  bad_directions: Array<{ direction: string; reason: string }>;
  good_directions: Array<{ direction: string; star: string }>;
}

export function readBoard(center: number, honmei: number, branch: number, breakLabel: "歳破" | "月破"): BoardReading {
  const bad = new Map<PalaceId, string[]>();
  const addBad = (p: PalaceId, reason: string) => {
    if (p === "center") return;
    bad.set(p, [...(bad.get(p) ?? []), reason]);
  };
  const five = palaceOf(center, 5);
  addBad(five, "五黄殺");
  if (five !== "center") addBad(OPPOSITE[five], "暗剣殺");
  const h = palaceOf(center, honmei);
  addBad(h, "本命殺");
  if (h !== "center") addBad(OPPOSITE[h], "本命的殺");
  addBad(BRANCH_DIRECTION[(branch + 6) % 12], breakLabel);

  const good = goodStars(honmei)
    .map((s) => ({ star: s, palace: palaceOf(center, s) }))
    .filter((g) => g.palace !== "center" && !bad.has(g.palace));

  return {
    center_star: STARS[center - 1],
    honmei_palace: palaceJa(h),
    bad_directions: [...bad.entries()].map(([p, reasons]) => ({ direction: palaceJa(p), reason: reasons.join("・") })),
    good_directions: good.map((g) => ({ direction: palaceJa(g.palace), star: STARS[g.star - 1] })),
  };
}

export interface KyuseiData {
  honmei_star: string;
  getsumei_star: string;
  period: {
    start: string;
    end: string;
    years: Array<{ solar_year: number } & BoardReading>;
    months: Array<{ begins: string } & BoardReading>;
  };
}

function compute(input: EngineInput): EngineResult<KyuseiData> {
  const { birth, period } = input;
  const [y, m, d] = birth.birthDate.split("-").map(Number);
  const [hh, mm] = birth.birthTime ? birth.birthTime.split(":").map(Number) : [12, 0];
  const instant = fromZoned({ year: y, month: m, day: d, hour: hh, minute: mm }, birth.timeZone);
  const caveats: string[] = [];
  if (!birth.birthTime) caveats.push("出生時刻が不明なため正午で判定。立春・節入り当日生まれの場合は本命星・月命星が前後する可能性がある。");

  const by = yearPillarAt(instant);
  const honmei = yearStar(by.solarYear);
  const getsumei = monthStar(honmei, monthPillarAt(instant).offset);

  const start = parseIsoDate(period.start);
  const end = parseIsoDate(period.end);
  const years: KyuseiData["period"]["years"] = [];
  for (let sy = yearPillarAt(start).solarYear; sy <= yearPillarAt(end).solarYear; sy++) {
    years.push({ solar_year: sy, ...readBoard(yearStar(sy), honmei, ((sy - 4) % 12 + 12) % 12, "歳破") });
  }

  const months: KyuseiData["period"]["months"] = [];
  let cursor = adjacentJie(start, -1);
  while (cursor.getTime() <= end.getTime() && months.length < 36) {
    const at = new Date(cursor.getTime() + 3600_000);
    const mp = monthPillarAt(at);
    const center = monthStar(yearStar(yearPillarAt(at).solarYear), mp.offset);
    months.push({ begins: todayIn(birth.timeZone, cursor), ...readBoard(center, honmei, mp.branch, "月破") });
    cursor = adjacentJie(new Date(cursor.getTime() + 86400_000), 1);
  }

  return {
    method: "kyusei",
    engine_version: KYUSEI_ENGINE_VERSION,
    settings: {
      year_boundary: "lichun",
      month_boundary: "jie_solar_terms",
      bad_directions: "gooh,ankensatsu,honmeisatsu,honmeitekisatsu,ha",
      good_directions: "honmei_sojo_hiwa",
    },
    caveats,
    data: {
      honmei_star: STARS[honmei - 1],
      getsumei_star: STARS[getsumei - 1],
      period: { start: period.start, end: period.end, years, months },
    },
  };
}

export const kyuseiEngine: DivinationEngine<KyuseiData> = {
  method: "kyusei",
  version: KYUSEI_ENGINE_VERSION,
  compute,
};
