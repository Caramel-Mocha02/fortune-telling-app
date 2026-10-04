import { describe, expect, it } from "vitest";
import * as Astronomy from "astronomy-engine";
import {
  cycleToPillar,
  dayPillarIndex,
  fourPillarsEngine,
  monthPillarAt,
  pillarName,
  tenGod,
  yearPillarAt,
} from "../four-pillars/engine";
import { computeAngles, eclipticLongitude, westernAstrologyEngine } from "../western/engine";
import { fromZoned } from "@/lib/time/zoned";
import type { BirthData } from "../types";

const jst = (y: number, mo: number, d: number, h = 12, mi = 0) =>
  fromZoned({ year: y, month: mo, day: d, hour: h, minute: mi }, "Asia/Tokyo");

describe("四柱推命: 暦計算", () => {
  it("日柱が既知の日付と一致する", () => {
    expect(pillarName(cycleToPillar(dayPillarIndex(1900, 1, 1)))).toBe("甲戌");
    expect(pillarName(cycleToPillar(dayPillarIndex(2000, 1, 1)))).toBe("戊午");
    expect(pillarName(cycleToPillar(dayPillarIndex(2024, 1, 1)))).toBe("甲子");
  });

  it("年柱は立春 (2024-02-04 17:27 JST) で切り替わる", () => {
    expect(pillarName(yearPillarAt(jst(2024, 2, 4, 17, 0)))).toBe("癸卯");
    expect(pillarName(yearPillarAt(jst(2024, 2, 4, 18, 0)))).toBe("甲辰");
    expect(pillarName(yearPillarAt(jst(1984, 3, 1)))).toBe("甲子");
  });

  it("月柱は節入りで切り替わり、月干は五虎遁に従う", () => {
    expect(pillarName(monthPillarAt(jst(2024, 1, 15)))).toBe("乙丑");
    expect(pillarName(monthPillarAt(jst(2024, 2, 20)))).toBe("丙寅");
    expect(pillarName(monthPillarAt(jst(2024, 3, 10)))).toBe("丁卯");
    expect(pillarName(monthPillarAt(jst(2024, 12, 20)))).toBe("丙子");
  });

  it("十神は日主との五行・陰陽関係で決まる", () => {
    // 日主 甲 (0)
    expect(tenGod(0, 0)).toBe("比肩");
    expect(tenGod(0, 1)).toBe("劫財");
    expect(tenGod(0, 2)).toBe("食神");
    expect(tenGod(0, 3)).toBe("傷官");
    expect(tenGod(0, 4)).toBe("偏財");
    expect(tenGod(0, 5)).toBe("正財");
    expect(tenGod(0, 6)).toBe("偏官");
    expect(tenGod(0, 7)).toBe("正官");
    expect(tenGod(0, 8)).toBe("偏印");
    expect(tenGod(0, 9)).toBe("印綬");
  });
});

const birth: BirthData = {
  birthDate: "1990-06-15",
  birthTime: "08:30",
  timeZone: "Asia/Tokyo",
  placeName: "東京",
  latitude: 35.6895,
  longitude: 139.6917,
  gender: "female",
};
const period = { start: "2026-10-01", end: "2027-09-30" };

describe("四柱推命: エンジン全体", () => {
  it("命式・大運・流年・流月を返す", () => {
    const r = fourPillarsEngine.compute({ birth, period });
    expect(r.engine_version).toBe("four_pillars_engine_v1");
    expect(r.data.pillars.year.name).toBe("庚午");
    expect(r.data.pillars.month.name).toBe("壬午");
    expect(r.data.pillars.day.name).toBe(pillarName(cycleToPillar(dayPillarIndex(1990, 6, 15))));
    expect(r.data.pillars.hour).not.toBeNull();
    // 庚 (陽) 年の女性 → 逆行
    expect(r.data.luck_pillars?.direction).toBe("backward");
    expect(r.data.luck_pillars?.pillars[0].name).toBe("辛巳");
    expect(r.data.period.annual.map((a) => a.name)).toEqual(["丙午", "丁未"]);
    expect(r.data.period.monthly.length).toBeGreaterThanOrEqual(12);
  });

  it("出生時刻・性別が不明なら時柱と大運を出さず caveat を残す", () => {
    const r = fourPillarsEngine.compute({ birth: { ...birth, birthTime: null, gender: "unspecified" }, period });
    expect(r.data.pillars.hour).toBeNull();
    expect(r.data.luck_pillars).toBeNull();
    expect(r.caveats.length).toBe(2);
  });
});

describe("西洋占星術", () => {
  it("2000-01-01 12:00 UTC の太陽は山羊座 10° 付近", () => {
    const lon = eclipticLongitude("sun", new Date(Date.UTC(2000, 0, 1, 12)));
    expect(lon).toBeGreaterThan(280.0);
    expect(lon).toBeLessThan(280.8);
  });

  it("ASC は東の地平線上、MC は子午線上にある", () => {
    const date = jst(1990, 6, 15, 8, 30);
    const lat = 35.6895;
    const lon = 139.6917;
    const { asc, mc } = computeAngles(date, lat, lon);
    const eps = (Astronomy.e_tilt(Astronomy.MakeTime(date)).tobl * Math.PI) / 180;
    const lst = ((Astronomy.SiderealTime(date) * 15 + lon) % 360) * (Math.PI / 180);
    const phi = (lat * Math.PI) / 180;

    const horizon = (eclLon: number) => {
      const l = (eclLon * Math.PI) / 180;
      const ra = Math.atan2(Math.sin(l) * Math.cos(eps), Math.cos(l));
      const dec = Math.asin(Math.sin(eps) * Math.sin(l));
      const H = lst - ra;
      const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
      return { altDeg: (alt * 180) / Math.PI, sinH: Math.sin(H) };
    };

    const a = horizon(asc);
    expect(Math.abs(a.altDeg)).toBeLessThan(0.01);
    expect(a.sinH).toBeLessThan(0); // 東 (上昇中)
    const m = horizon(mc);
    expect(Math.abs(m.sinH)).toBeLessThan(1e-6); // 時角 0
  });

  it("出生図と予測期間のトランジットを返す", () => {
    const r = westernAstrologyEngine.compute({ birth, period });
    expect(r.data.planets).toHaveLength(10);
    expect(r.data.planets[0].sign).toBe("gemini");
    expect(r.data.angles).not.toBeNull();
    expect(r.data.planets.every((p) => p.house !== null)).toBe(true);
    for (const t of r.data.period.transits) {
      expect(t.start <= t.exact && t.exact <= t.end).toBe(true);
      expect(t.min_orb).toBeLessThanOrEqual(1.5);
    }
  });

  it("出生時刻不明ならハウスと ASC を出さない", () => {
    const r = westernAstrologyEngine.compute({ birth: { ...birth, birthTime: null }, period });
    expect(r.data.angles).toBeNull();
    expect(r.data.planets.every((p) => p.house === null)).toBe(true);
    expect(r.data.natal_aspects.some((a) => a.a === "moon" || a.b === "moon")).toBe(false);
  });
});
