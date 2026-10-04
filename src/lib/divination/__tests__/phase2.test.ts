import { describe, expect, it } from "vitest";
import { lifePath, numerologyEngine, personalYear, reduce } from "../numerology/engine";
import { kyuseiEngine, monthStar, readBoard, yearStar } from "../kyusei/engine";
import { mainStar, sanmeiEngine, subordinateStar, tenchusatsuBranches } from "../sanmei/engine";
import { ziweiPosition, ziWeiEngine } from "../zi-wei/engine";
import { route } from "@/lib/routing/router";
import { ENGINES } from "../registry";
import type { BirthData } from "../types";

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

describe("数秘術", () => {
  it("ライフパスとマスターナンバー", () => {
    expect(lifePath("1990-06-15")).toBe(4);
    expect(lifePath("2009-09-09")).toBe(11);
    expect(reduce(22)).toBe(22);
    expect(reduce(22, false)).toBe(4);
  });

  it("個人年", () => {
    expect(personalYear("1990-06-15", 2026)).toBe(4);
    expect(personalYear("1990-06-15", 2027)).toBe(5);
  });

  it("ピナクルは 4 期間で連続する", () => {
    const r = numerologyEngine.compute({ birth, period });
    const p = r.data.pinnacles;
    expect(p[0].to_age).toBe(36 - 4);
    expect(p[1].from_age).toBe(p[0].to_age! + 1);
    expect(p[3].to_age).toBeNull();
    expect(r.data.period.personal_months).toHaveLength(12);
  });
});

describe("九星気学", () => {
  it("本命星", () => {
    expect(yearStar(1990)).toBe(1);
    expect(yearStar(2000)).toBe(9);
    expect(yearStar(2024)).toBe(3);
    expect(yearStar(2026)).toBe(1);
  });

  it("月の九星は年をまたいで連続する", () => {
    expect(monthStar(4, 11)).toBe(6); // 2024 年 1 月 (2023 年 四緑の丑月)
    expect(monthStar(3, 0)).toBe(5); // 2024 年 2 月 (三碧の寅月)
  });

  it("2026 年 (一白中宮・午年): 五黄殺は南、暗剣殺と歳破は北", () => {
    const b = readBoard(1, 1, 6, "歳破");
    expect(b.bad_directions).toContainEqual({ direction: "南 (離)", reason: "五黄殺" });
    expect(b.bad_directions).toContainEqual({ direction: "北 (坎)", reason: "暗剣殺・歳破" });
    expect(b.honmei_palace).toBe("中宮");
    expect(b.good_directions.every((g) => !b.bad_directions.some((x) => x.direction === g.direction))).toBe(true);
  });

  it("エンジン: 1990/6/15 生まれは一白水星", () => {
    const r = kyuseiEngine.compute({ birth, period });
    expect(r.data.honmei_star).toBe("一白水星");
    expect(r.data.period.years.map((y) => y.center_star)).toEqual(["一白水星", "九紫火星"]);
    expect(r.data.period.months.length).toBeGreaterThanOrEqual(12);
  });
});

describe("算命学", () => {
  it("十大主星と十二大従星", () => {
    expect(mainStar(0, 0)).toBe("貫索星");
    expect(mainStar(0, 9)).toBe("玉堂星");
    expect(subordinateStar(0, 11)).toBe("天貴星"); // 甲・亥 = 長生
    expect(subordinateStar(0, 3)).toBe("天将星"); // 甲・卯 = 帝旺
    expect(subordinateStar(1, 2)).toBe("天将星"); // 乙・寅 = 帝旺 (陰干逆行)
  });

  it("天中殺", () => {
    expect(tenchusatsuBranches(0)).toEqual([10, 11]); // 甲子旬 → 戌亥
    expect(tenchusatsuBranches(15)).toEqual([8, 9]); // 甲戌旬 → 申酉
  });

  it("エンジン: 陰占は四柱推命と同じ干支", () => {
    const r = sanmeiEngine.compute({ birth, period });
    expect(r.data.insen.year).toBe("庚午");
    expect(r.data.insen.month).toBe("壬午");
    expect(r.data.yosen.main_stars).toHaveLength(5);
    expect(r.data.period.annual.map((a) => a.name)).toEqual(["丙午", "丁未"]);
  });
});

describe("紫微斗数", () => {
  it("紫微星の位置は早見表と一致する", () => {
    expect(ziweiPosition(1, 2)).toBe(1); // 水二局 初一 → 丑
    expect(ziweiPosition(2, 2)).toBe(2); // 水二局 初二 → 寅
    expect(ziweiPosition(1, 3)).toBe(4); // 木三局 初一 → 辰
    expect(ziweiPosition(1, 4)).toBe(11); // 金四局 初一 → 亥
    expect(ziweiPosition(1, 5)).toBe(6); // 土五局 初一 → 午
    expect(ziweiPosition(1, 6)).toBe(9); // 火六局 初一 → 酉
  });

  it("命盤: 旧暦 5/23 辰刻 庚午年 → 命宮寅・土五局・紫微天府同宮 (申)", () => {
    const r = ziWeiEngine.compute({ birth, period });
    const c = r.data.chart!;
    expect(r.data.lunar_birth).toEqual({ year: 1990, month: 5, day: 23, isLeap: false });
    expect(c.ming_palace_branch).toBe("寅");
    expect(c.bureau).toBe("土五局");
    const shen = c.palaces.find((p) => p.branch === "申")!;
    expect(shen.main_stars.map((s) => s.slice(0, 2))).toEqual(expect.arrayContaining(["紫微", "天府"]));
    expect(c.palaces.flatMap((p) => p.main_stars)).toHaveLength(14);
    // 庚 (陽) 年の女性 → 逆行、第 1 大限は 5 歳から命宮
    expect(c.decades?.[0]).toMatchObject({ palace: "命宮", from_age: 5 });
    expect(c.decades?.[1].branch).toBe("丑");
  });

  it("時刻不明なら命盤を出さない", () => {
    const r = ziWeiEngine.compute({ birth: { ...birth, birthTime: null }, period });
    expect(r.data.chart).toBeNull();
    expect(r.caveats.length).toBeGreaterThan(0);
  });
});

describe("全エンジン", () => {
  it("全カテゴリーで実装済みの占術がすべて計算できる", () => {
    for (const category of ["LIFE", "MOVE", "MONEY", "TIMING"] as const) {
      const r = route(category);
      for (const m of [...r.primary, ...r.secondary]) {
        const result = ENGINES[m]!.compute({ birth, period });
        expect(result.method).toBe(m);
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
      }
    }
  });
});
