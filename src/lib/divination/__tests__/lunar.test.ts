import { describe, expect, it } from "vitest";
import { toLunar } from "../calendar/lunar";

const cst = (d: string) => toLunar(d, "Asia/Shanghai");

describe("旧暦変換", () => {
  it("2024 年の春節は 2/10", () => {
    expect(cst("2024-02-10")).toEqual({ year: 2024, month: 1, day: 1, isLeap: false });
    expect(cst("2024-02-09")).toMatchObject({ year: 2023, month: 12, day: 30 });
  });

  it("2023 年の閏 2 月 (3/22 開始)", () => {
    expect(cst("2023-03-21")).toEqual({ year: 2023, month: 2, day: 30, isLeap: false });
    expect(cst("2023-03-22")).toEqual({ year: 2023, month: 2, day: 1, isLeap: true });
    expect(cst("2023-04-20")).toEqual({ year: 2023, month: 3, day: 1, isLeap: false });
  });

  it("1990 年の閏 5 月 (6/23 開始)", () => {
    expect(cst("1990-06-15")).toEqual({ year: 1990, month: 5, day: 23, isLeap: false });
    expect(cst("1990-06-23")).toEqual({ year: 1990, month: 5, day: 1, isLeap: true });
  });

  it("冬至後・正月前の日付は前年扱い", () => {
    expect(cst("2025-01-01")).toMatchObject({ year: 2024, month: 12, day: 2 });
  });
});
