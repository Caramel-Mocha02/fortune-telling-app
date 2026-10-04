/**
 * 数秘術 計算エンジン v1 (ピタゴラス式)
 *
 * - ライフパス: 生年月日の全桁を合計して還元 (11 / 22 / 33 はマスターナンバーとして保持)
 * - バースデー: 日の還元
 * - 個人年・個人月: 暦年基準 (1/1 切り替え)。全桁合計を 1〜9 に還元
 * - ピナクル / チャレンジ: 人生の4つの周期と節目の年齢
 *
 * 氏名を使う数 (ディスティニー等) はプロフィールに氏名がないため v1 では扱わない。
 */
import type { DivinationEngine, EngineInput, EngineResult } from "../types";

export const NUMEROLOGY_ENGINE_VERSION = "numerology_engine_v1";

const MASTER = new Set([11, 22, 33]);

const digitSum = (n: number) =>
  String(Math.abs(n))
    .split("")
    .reduce((s, d) => s + Number(d), 0);

/** 1 桁 (またはマスターナンバー) になるまで還元 */
export function reduce(n: number, keepMaster = true): number {
  let x = n;
  while (x > 9 && !(keepMaster && MASTER.has(x))) x = digitSum(x);
  return x;
}

export function lifePath(birthDate: string): number {
  return reduce(digitSum(Number(birthDate.replaceAll("-", ""))));
}

export function personalYear(birthDate: string, year: number): number {
  const [, m, d] = birthDate.split("-").map(Number);
  return reduce(digitSum(m) + digitSum(d) + digitSum(year), false);
}

export function personalMonth(birthDate: string, year: number, month: number): number {
  return reduce(personalYear(birthDate, year) + month, false);
}

export interface NumerologyData {
  life_path: number;
  birthday_number: number;
  pinnacles: Array<{ number: number; challenge: number; from_age: number; to_age: number | null }>;
  current_pinnacle_at_period_start: number;
  period: {
    start: string;
    end: string;
    personal_years: Array<{ year: number; number: number }>;
    personal_months: Array<{ month: string; number: number }>;
    /** 期間内に迎えるピナクルの切り替わり (人生の節目) */
    pinnacle_transitions: Array<{ date: string; to_pinnacle: number }>;
  };
}

function compute(input: EngineInput): EngineResult<NumerologyData> {
  const { birth, period } = input;
  const [by, bm, bd] = birth.birthDate.split("-").map(Number);
  const lp = lifePath(birth.birthDate);
  const m = reduce(bm, false);
  const d = reduce(bd, false);
  const y = reduce(digitSum(by), false);

  const p1 = reduce(m + d);
  const p2 = reduce(d + y);
  const p3 = reduce(p1 + p2);
  const p4 = reduce(m + y);
  const c1 = Math.abs(m - d);
  const c2 = Math.abs(d - y);
  const c3 = Math.abs(c1 - c2);
  const c4 = Math.abs(m - y);

  const firstEnd = 36 - reduce(lp, false);
  const ages = [0, firstEnd + 1, firstEnd + 10, firstEnd + 19];
  const pinnacles = [
    { number: p1, challenge: c1, from_age: ages[0], to_age: ages[1] - 1 },
    { number: p2, challenge: c2, from_age: ages[1], to_age: ages[2] - 1 },
    { number: p3, challenge: c3, from_age: ages[2], to_age: ages[3] - 1 },
    { number: p4, challenge: c4, from_age: ages[3], to_age: null },
  ];

  const ageAt = (iso: string) => {
    const [yy, mm, dd] = iso.split("-").map(Number);
    return yy - by - (mm < bm || (mm === bm && dd < bd) ? 1 : 0);
  };
  const pinnacleIndexAt = (age: number) => (age >= ages[3] ? 3 : age >= ages[2] ? 2 : age >= ages[1] ? 1 : 0);

  const [sy, sm] = period.start.split("-").map(Number);
  const [ey, em] = period.end.split("-").map(Number);

  const personalYears = [];
  for (let yr = sy; yr <= ey; yr++) personalYears.push({ year: yr, number: personalYear(birth.birthDate, yr) });

  const personalMonths = [];
  for (let yr = sy, mo = sm; yr < ey || (yr === ey && mo <= em); mo === 12 ? ((mo = 1), yr++) : mo++) {
    if (personalMonths.length >= 36) break;
    personalMonths.push({ month: `${yr}-${String(mo).padStart(2, "0")}`, number: personalMonth(birth.birthDate, yr, mo) });
  }

  const transitions = [];
  for (const idx of [1, 2, 3]) {
    const date = `${by + ages[idx]}-${String(bm).padStart(2, "0")}-${String(bd).padStart(2, "0")}`;
    if (date >= period.start && date <= period.end) transitions.push({ date, to_pinnacle: pinnacles[idx].number });
  }

  return {
    method: "numerology",
    engine_version: NUMEROLOGY_ENGINE_VERSION,
    settings: {
      system: "pythagorean",
      life_path_method: "sum_all_digits",
      master_numbers: "11,22,33",
      personal_year_boundary: "calendar_year",
    },
    caveats: ["氏名を使う数 (ディスティニー・ソウル等) は未登録のため算出していない。"],
    data: {
      life_path: lp,
      birthday_number: reduce(bd),
      pinnacles,
      current_pinnacle_at_period_start: pinnacles[pinnacleIndexAt(ageAt(period.start))].number,
      period: {
        start: period.start,
        end: period.end,
        personal_years: personalYears,
        personal_months: personalMonths,
        pinnacle_transitions: transitions,
      },
    },
  };
}

export const numerologyEngine: DivinationEngine<NumerologyData> = {
  method: "numerology",
  version: NUMEROLOGY_ENGINE_VERSION,
  compute,
};
