/**
 * 太陰太陽暦 (旧暦) への変換。
 *
 * 現行の旧暦と同じ定気法: 朔日 (新月の日) を月の始まりとし、冬至を含む月を 11 月とする。
 * 冬至から次の冬至までに 13 か月ある年は、最初の「中気を含まない月」を閏月とする。
 * 日付の境界は指定タイムゾーンの 0 時 (日本の旧暦なら Asia/Tokyo、中国暦なら Asia/Shanghai)。
 */
import * as Astronomy from "astronomy-engine";
import { addDays, daysBetween, fromZoned, parseIsoDate, todayIn } from "@/lib/time/zoned";

export interface LunarDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-30
  isLeap: boolean;
}

function winterSolstice(year: number): Date {
  const t = Astronomy.SearchSunLongitude(270, new Date(Date.UTC(year, 11, 10)), 30);
  if (!t) throw new Error("冬至の探索に失敗しました");
  return t.date;
}

/** from 以降の新月を順に count 個 */
function newMoonsFrom(from: Date, count: number): Date[] {
  const out: Date[] = [];
  let cursor = from;
  while (out.length < count) {
    const t = Astronomy.SearchMoonPhase(0, cursor, 40);
    if (!t) throw new Error("新月の探索に失敗しました");
    out.push(t.date);
    cursor = new Date(t.date.getTime() + 86400_000);
  }
  return out;
}

const sunLon = (d: Date) => Astronomy.SunPosition(d).elon;

/** ローカル日付 [startDay, endDay) の間に中気 (太陽黄経 30° の倍数) があるか */
function containsZhongqi(startDay: string, endDay: string, timeZone: string): boolean {
  const midnight = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return fromZoned({ year: y, month: m, day: d, hour: 0, minute: 0 }, timeZone);
  };
  const a = sunLon(midnight(startDay));
  const b = sunLon(midnight(endDay));
  const advance = (b - a + 360) % 360;
  return (a % 30) + advance >= 30;
}

export function toLunar(date: string, timeZone: string): LunarDate {
  const gy = Number(date.slice(0, 4));
  const localDay = (d: Date) => todayIn(timeZone, d);

  let wsYear = gy;
  if (localDay(winterSolstice(gy)) > date) wsYear = gy - 1;
  const ws0Day = localDay(winterSolstice(wsYear));
  const ws1Day = localDay(winterSolstice(wsYear + 1));

  // 冬至の日以前で最後の朔日 = 11 月 1 日
  const candidates = newMoonsFrom(addDays(parseIsoDate(ws0Day), -35), 3).map(localDay);
  const m0 = candidates.filter((d) => d <= ws0Day).at(-1)!;

  // 11 月から次の 11 月までの朔日
  const moons = [m0];
  for (const d of newMoonsFrom(addDays(parseIsoDate(m0), 1), 14).map(localDay)) {
    if (d > ws1Day) break;
    moons.push(d);
  }
  const monthsInCycle = moons.length - 1;
  let leapIndex = -1;
  if (monthsInCycle === 13) {
    for (let i = 0; i < monthsInCycle; i++) {
      if (!containsZhongqi(moons[i], moons[i + 1], timeZone)) {
        leapIndex = i;
        break;
      }
    }
  }

  // 各朔日に月番号を振る
  let month = 11;
  let year = wsYear;
  const labels: LunarDate[] = [];
  moons.forEach((_, i) => {
    if (i > 0 && i !== leapIndex) {
      month = month === 12 ? 1 : month + 1;
      if (month === 1) year = wsYear + 1;
    }
    labels.push({ year, month, day: 1, isLeap: i === leapIndex });
  });

  const idx = moons.findLastIndex((d) => d <= date);
  const day = Math.round(daysBetween(parseIsoDate(moons[idx]), parseIsoDate(date))) + 1;
  return { ...labels[idx], day };
}
