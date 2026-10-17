import { describe, expect, it } from "vitest";
import { daysInMonth, warekiOfYear } from "../wareki";

describe("和暦", () => {
  it("ふつうの年", () => {
    expect(warekiOfYear(1990)).toBe("平成2年");
    expect(warekiOfYear(1975)).toBe("昭和50年");
    expect(warekiOfYear(2026)).toBe("令和8年");
  });
  it("改元のあった年は両方を併記", () => {
    expect(warekiOfYear(1989)).toBe("昭和64年・平成元年");
    expect(warekiOfYear(2019)).toBe("平成31年・令和元年");
    expect(warekiOfYear(1926)).toBe("大正15年・昭和元年");
  });
  it("月の日数 (うるう年)", () => {
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2024, 4)).toBe(30);
  });
});
