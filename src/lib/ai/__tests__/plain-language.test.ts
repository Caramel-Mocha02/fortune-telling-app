import { describe, expect, it } from "vitest";
import { findJargon } from "../plain-language";

describe("専門用語の検出", () => {
  it("専門用語を見つける", () => {
    expect(findJargon("流年が偏官で、10ハウスに土星がトランジット")).toEqual(["ハウス", "トランジット", "偏官", "流年"]);
  });
  it("日常の言葉だけなら空", () => {
    expect(findJargon("西洋占星術と四柱推命の両方で、この時期に立場が変わりやすい流れが出ています")).toEqual([]);
  });
});
