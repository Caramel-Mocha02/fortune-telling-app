import { describe, expect, it } from "vitest";
import { parsePlaceName, PREFECTURES } from "../places";

describe("出生地の一覧", () => {
  it("47 都道府県と全国の市区町村があり、座標が日本の範囲内", () => {
    expect(PREFECTURES).toHaveLength(47);
    const all = PREFECTURES.flatMap((p) => p.cities);
    expect(all.length).toBeGreaterThan(1700);
    for (const [, lat, lon] of all) {
      expect(lat).toBeGreaterThan(20);
      expect(lat).toBeLessThan(46);
      expect(lon).toBeGreaterThan(122);
      expect(lon).toBeLessThan(154);
    }
  });

  it("東京都新宿区の代表点は新宿区役所付近", () => {
    const shinjuku = PREFECTURES.find((p) => p.pref === "東京都")!.cities.find(([n]) => n === "新宿区")!;
    expect(shinjuku[1]).toBeCloseTo(35.69, 1);
    expect(shinjuku[2]).toBeCloseTo(139.7, 1);
  });

  it("保存済みの地名を都道府県と市区町村に分ける", () => {
    expect(parsePlaceName("東京都新宿区")).toEqual({ pref: "東京都", city: "新宿区" });
    expect(parsePlaceName("北海道札幌市中央区")).toEqual({ pref: "北海道", city: "札幌市中央区" });
    expect(parsePlaceName("大阪府")).toEqual({ pref: "大阪府", city: null });
    expect(parsePlaceName("東京 (新宿)")).toBeNull(); // 旧形式は直接入力として扱う
    expect(parsePlaceName("New York")).toBeNull();
  });
});
