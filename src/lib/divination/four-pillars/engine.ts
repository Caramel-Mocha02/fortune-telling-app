/**
 * 四柱推命 計算エンジン v1
 *
 * - 年柱: 立春 (太陽黄経 315°) で切り替え
 * - 月柱: 節入り (太陽黄経 15° + 30°n) で切り替え。月干は五虎遁
 * - 日柱: ユリウス通日 (JDN) から算出。日の区切りは既定で 0 時
 * - 時柱: 2 時間ごとの十二支、時干は五鼠遁
 * - 大運: 年干の陰陽と性別で順行・逆行、起運は節入りまでの日数 ÷ 3
 * - 流年・流月: 予測期間内の干支と十神
 *
 * 節入り時刻は astronomy-engine で太陽黄経を探索して求める (暦表を持たない)。
 */
import * as Astronomy from "astronomy-engine";
import type { DivinationEngine, EngineInput, EngineResult } from "../types";
import { addDays, fromZoned, parseIsoDate, toZoned } from "@/lib/time/zoned";

export const FOUR_PILLARS_ENGINE_VERSION = "four_pillars_engine_v1";

export const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
export const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

export const ELEMENTS = ["wood", "fire", "earth", "metal", "water"] as const;
type Element = (typeof ELEMENTS)[number];
const ELEMENT_JA: Record<Element, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };

export const STEM_ELEMENT = (stem: number): Element => ELEMENTS[Math.floor(stem / 2)];
export const STEM_IS_YANG = (stem: number) => stem % 2 === 0;
export const BRANCH_ELEMENT: Element[] = [
  "water", "earth", "wood", "wood", "earth", "fire", "fire", "earth", "metal", "metal", "earth", "water",
];

/** 蔵干 (本気を先頭に) */
export const HIDDEN_STEMS: number[][] = [
  [9], // 子: 癸
  [5, 9, 7], // 丑: 己 癸 辛
  [0, 2, 4], // 寅: 甲 丙 戊
  [1], // 卯: 乙
  [4, 1, 9], // 辰: 戊 乙 癸
  [2, 6, 4], // 巳: 丙 庚 戊
  [3, 5], // 午: 丁 己
  [5, 3, 1], // 未: 己 丁 乙
  [6, 8, 4], // 申: 庚 壬 戊
  [7], // 酉: 辛
  [4, 7, 3], // 戌: 戊 辛 丁
  [8, 0], // 亥: 壬 甲
];

const TEN_GODS: [string, string][] = [
  ["比肩", "劫財"], // 同じ五行
  ["食神", "傷官"], // 日主が生じる
  ["偏財", "正財"], // 日主が剋す
  ["偏官", "正官"], // 日主を剋す
  ["偏印", "印綬"], // 日主を生じる
];

export function tenGod(dayStem: number, other: number): string {
  const rel = (ELEMENTS.indexOf(STEM_ELEMENT(other)) - ELEMENTS.indexOf(STEM_ELEMENT(dayStem)) + 5) % 5;
  const samePolarity = STEM_IS_YANG(dayStem) === STEM_IS_YANG(other);
  return TEN_GODS[rel][samePolarity ? 0 : 1];
}

/** 六十干支インデックス (0 = 甲子) から干・支を得る */
export function cycleToPillar(index: number) {
  const i = ((index % 60) + 60) % 60;
  return { cycle: i, stem: i % 10, branch: i % 12 };
}

/** 干・支インデックスから六十干支インデックスを得る */
export function pillarToCycle(stem: number, branch: number): number {
  for (let i = 0; i < 60; i++) if (i % 10 === stem && i % 12 === branch) return i;
  throw new Error(`invalid stem/branch pair ${stem}/${branch}`);
}

export function pillarName(p: { stem: number; branch: number }) {
  return `${STEMS[p.stem]}${BRANCHES[p.branch]}`;
}

/** グレゴリオ暦日付のユリウス通日 */
export function julianDayNumber(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

export function dayPillarIndex(year: number, month: number, day: number): number {
  return (julianDayNumber(year, month, day) + 49) % 60;
}

function sunLongitude(date: Date): number {
  return Astronomy.SunPosition(date).elon;
}

/** 指定した瞬間の年柱 (立春切り替え) */
export function yearPillarAt(instant: Date) {
  const y = instant.getUTCFullYear();
  const lichun = Astronomy.SearchSunLongitude(315, new Date(Date.UTC(y, 0, 20)), 30);
  if (!lichun) throw new Error("立春の探索に失敗しました");
  const solarYear = instant.getTime() < lichun.date.getTime() ? y - 1 : y;
  return { solarYear, ...cycleToPillar(solarYear - 4) };
}

/** 指定した瞬間の月柱 (節入り切り替え) */
export function monthPillarAt(instant: Date) {
  const year = yearPillarAt(instant);
  const offset = Math.floor((((sunLongitude(instant) - 315) % 360) + 360) % 360 / 30); // 寅月 = 0
  const branch = (2 + offset) % 12;
  const stem = (((year.stem % 5) * 2 + 2) % 10 + offset) % 10;
  return { stem, branch, cycle: pillarToCycle(stem, branch), offset };
}

/** 次 (dir=1) または直前 (dir=-1) の節入り時刻 */
export function adjacentJie(instant: Date, dir: 1 | -1): Date {
  const lon = sunLongitude(instant);
  const k = (lon - 15) / 30;
  const target = 15 + 30 * (dir === 1 ? Math.floor(k) + 1 : Math.floor(k));
  const start = dir === 1 ? instant : addDays(instant, -35);
  const t = Astronomy.SearchSunLongitude(((target % 360) + 360) % 360, start, 40);
  if (!t) throw new Error("節入りの探索に失敗しました");
  return t.date;
}

// --- 結果の型 ----------------------------------------------------------------

interface PillarView {
  name: string;
  stem: string;
  branch: string;
  stem_element: string;
  branch_element: string;
  stem_ten_god: string | null;
  hidden_stems: Array<{ stem: string; ten_god: string }>;
}

export interface FourPillarsData {
  day_master: { stem: string; element: string; polarity: "陽" | "陰" };
  pillars: { year: PillarView; month: PillarView; day: PillarView; hour: PillarView | null };
  element_counts: Record<string, number>;
  element_counts_with_hidden: Record<string, number>;
  ten_god_counts: Record<string, number>;
  luck_pillars: {
    direction: "forward" | "backward";
    start_age: number;
    pillars: Array<{ name: string; start_age: number; start_date: string; stem_ten_god: string; branch_main_ten_god: string }>;
    current_at_period_start: string | null;
  } | null;
  period: {
    start: string;
    end: string;
    annual: Array<{ solar_year: number; begins: string; name: string; stem_ten_god: string; branch_main_ten_god: string }>;
    monthly: Array<{ begins: string; name: string; stem_ten_god: string; branch_main_ten_god: string }>;
  };
}

// --- エンジン ----------------------------------------------------------------

function compute(input: EngineInput): EngineResult<FourPillarsData> {
  const { birth, period } = input;
  const caveats: string[] = [];
  const [year, month, day] = birth.birthDate.split("-").map(Number);
  const timeKnown = birth.birthTime !== null;
  const [hour, minute] = timeKnown ? birth.birthTime!.split(":").map(Number) : [12, 0];
  const instant = fromZoned({ year, month, day, hour, minute }, birth.timeZone);
  if (!timeKnown) caveats.push("出生時刻が不明なため時柱は算出していない。節入り日生まれの場合は月柱・年柱も確認が必要。");

  const localDate = (d: Date) => {
    const z = toZoned(d, birth.timeZone);
    return `${z.year}-${String(z.month).padStart(2, "0")}-${String(z.day).padStart(2, "0")}`;
  };

  const yp = yearPillarAt(instant);
  const mp = monthPillarAt(instant);
  const dp = cycleToPillar(dayPillarIndex(year, month, day));
  const dayStem = dp.stem;
  const hp = timeKnown
    ? (() => {
        const branch = Math.floor((hour * 60 + minute + 60) / 120) % 12;
        return { stem: ((dayStem % 5) * 2 + branch) % 10, branch };
      })()
    : null;

  const view = (p: { stem: number; branch: number }, isDay = false): PillarView => ({
    name: pillarName(p),
    stem: STEMS[p.stem],
    branch: BRANCHES[p.branch],
    stem_element: ELEMENT_JA[STEM_ELEMENT(p.stem)],
    branch_element: ELEMENT_JA[BRANCH_ELEMENT[p.branch]],
    stem_ten_god: isDay ? null : tenGod(dayStem, p.stem),
    hidden_stems: HIDDEN_STEMS[p.branch].map((s) => ({ stem: STEMS[s], ten_god: tenGod(dayStem, s) })),
  });

  const pillarsList = [yp, mp, dp, ...(hp ? [hp] : [])];
  const elementCounts: Record<string, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const elementWithHidden: Record<string, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const tenGodCounts: Record<string, number> = {};
  for (const p of pillarsList) {
    elementCounts[ELEMENT_JA[STEM_ELEMENT(p.stem)]] += 1;
    elementCounts[ELEMENT_JA[BRANCH_ELEMENT[p.branch]]] += 1;
    elementWithHidden[ELEMENT_JA[STEM_ELEMENT(p.stem)]] += 1;
    for (const h of HIDDEN_STEMS[p.branch]) elementWithHidden[ELEMENT_JA[STEM_ELEMENT(h)]] += 1;
    if (p !== dp) tenGodCounts[tenGod(dayStem, p.stem)] = (tenGodCounts[tenGod(dayStem, p.stem)] ?? 0) + 1;
    const main = tenGod(dayStem, HIDDEN_STEMS[p.branch][0]);
    tenGodCounts[main] = (tenGodCounts[main] ?? 0) + 1;
  }

  // 大運
  const periodStart = parseIsoDate(period.start);
  const periodEnd = parseIsoDate(period.end);
  let luck: FourPillarsData["luck_pillars"] = null;
  if (birth.gender === "unspecified") {
    caveats.push("性別が未指定のため大運 (順行・逆行) は算出していない。");
  } else {
    const yang = STEM_IS_YANG(yp.stem);
    const forward = (yang && birth.gender === "male") || (!yang && birth.gender === "female");
    const jie = adjacentJie(instant, forward ? 1 : -1);
    const startAge = Math.round((Math.abs(jie.getTime() - instant.getTime()) / 86400000 / 3) * 10) / 10;
    const pillars = Array.from({ length: 8 }, (_, i) => {
      const p = cycleToPillar(mp.cycle + (forward ? i + 1 : -(i + 1)));
      const age = Math.round((startAge + 10 * i) * 10) / 10;
      return {
        name: pillarName(p),
        start_age: age,
        start_date: localDate(addDays(instant, age * 365.2422)),
        stem_ten_god: tenGod(dayStem, p.stem),
        branch_main_ten_god: tenGod(dayStem, HIDDEN_STEMS[p.branch][0]),
      };
    });
    const current = [...pillars].reverse().find((p) => p.start_date <= period.start);
    luck = {
      direction: forward ? "forward" : "backward",
      start_age: startAge,
      pillars,
      current_at_period_start: current ? current.name : null,
    };
  }

  // 流年
  const annual: FourPillarsData["period"]["annual"] = [];
  const firstYear = yearPillarAt(periodStart).solarYear;
  const lastYear = yearPillarAt(periodEnd).solarYear;
  for (let y = firstYear; y <= lastYear; y++) {
    const p = cycleToPillar(y - 4);
    const lichun = Astronomy.SearchSunLongitude(315, new Date(Date.UTC(y, 0, 20)), 30)!;
    annual.push({
      solar_year: y,
      begins: localDate(lichun.date),
      name: pillarName(p),
      stem_ten_god: tenGod(dayStem, p.stem),
      branch_main_ten_god: tenGod(dayStem, HIDDEN_STEMS[p.branch][0]),
    });
  }

  // 流月 (期間内の節入りごと。長期予測では最大 36 か月まで)
  const monthly: FourPillarsData["period"]["monthly"] = [];
  let cursor = adjacentJie(periodStart, -1);
  while (cursor.getTime() <= periodEnd.getTime() && monthly.length < 36) {
    const p = monthPillarAt(new Date(cursor.getTime() + 3600_000));
    monthly.push({
      begins: localDate(cursor),
      name: pillarName(p),
      stem_ten_god: tenGod(dayStem, p.stem),
      branch_main_ten_god: tenGod(dayStem, HIDDEN_STEMS[p.branch][0]),
    });
    cursor = adjacentJie(new Date(cursor.getTime() + 86400_000), 1);
  }

  return {
    method: "four_pillars",
    engine_version: FOUR_PILLARS_ENGINE_VERSION,
    settings: {
      year_boundary: "lichun",
      month_boundary: "jie_solar_terms",
      day_boundary: "midnight",
      late_zi_hour_stem: "same_day",
      time_basis: "standard_time",
      hidden_stems: "main_middle_residual",
      luck_start_rule: "days_div_3",
    },
    caveats,
    data: {
      day_master: {
        stem: STEMS[dayStem],
        element: ELEMENT_JA[STEM_ELEMENT(dayStem)],
        polarity: STEM_IS_YANG(dayStem) ? "陽" : "陰",
      },
      pillars: { year: view(yp), month: view(mp), day: view(dp, true), hour: hp ? view(hp) : null },
      element_counts: elementCounts,
      element_counts_with_hidden: elementWithHidden,
      ten_god_counts: tenGodCounts,
      luck_pillars: luck,
      period: { start: period.start, end: period.end, annual, monthly },
    },
  };
}

export const fourPillarsEngine: DivinationEngine<FourPillarsData> = {
  method: "four_pillars",
  version: FOUR_PILLARS_ENGINE_VERSION,
  compute,
};
