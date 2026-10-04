import { describe, expect, it } from "vitest";
import { ageBand, defaultDirection, generateBaselines } from "@/lib/prediction/baselines";
import { autoScore, compareWithBaselines } from "../baselines";
import type { EvaluableItem, EvaluableOutcome } from "@/lib/evaluation/evaluate";

const careerItem = { theme: "career" as const, start_date: "2027-01-01", end_date: "2027-06-30" };
const loveItem = { theme: "love" as const, start_date: "2026-11-01", end_date: "2027-01-31" };

describe("ベースライン予測の生成", () => {
  it("年齢層", () => {
    expect(ageBand("1990-06-15", "2026-10-04")).toBe("middle"); // 36 歳
    expect(ageBand("2000-10-05", "2026-10-04")).toBe("young"); // 誕生日前日で 25 歳
    expect(ageBand("1970-01-01", "2026-10-04")).toBe("senior");
  });

  it("項目ごとに B (history) と C (prior) を同じテーマ・期間で作る", () => {
    const b = generateBaselines([careerItem, loveItem], "1990-06-15", "2026-10-04", []);
    expect(b).toHaveLength(4);
    expect(b.map((x) => [x.position, x.baseline])).toEqual([
      [0, "history"],
      [0, "prior"],
      [1, "history"],
      [1, "prior"],
    ]);
    expect(b.every((x) => x.start_date === (x.position === 0 ? careerItem : loveItem).start_date)).toBe(true);
  });

  it("C: 4 月を含む期間の仕事は役割の変化、それ以外は年齢層の典型", () => {
    const [, prior] = generateBaselines([careerItem], "1990-06-15", "2026-10-04", []);
    expect(prior.event_type).toBe("role_change");
    expect(prior.basis).toContain("年度替わり");
    const [, noApril] = generateBaselines([{ ...careerItem, start_date: "2026-10-04", end_date: "2027-02-28" }], "2000-01-01", "2026-10-04", []);
    expect(noApril.event_type).toBe("job_change");
  });

  it("B: 過去の記録の最頻値。予測日以降の出来事は使わない", () => {
    const outcomes = [
      { occurred_at: "2025-03-01", theme: "career" as const, event_type: "new_project" as const, direction: "positive" as const, magnitude: "small" as const },
      { occurred_at: "2025-09-01", theme: "career" as const, event_type: "new_project" as const, direction: "positive" as const, magnitude: "small" as const },
      { occurred_at: "2026-01-01", theme: "career" as const, event_type: "conflict" as const, direction: "negative" as const, magnitude: "medium" as const },
      // 予測日以降: 3 件あっても使わない
      ...Array.from({ length: 3 }, () => ({ occurred_at: "2026-12-01", theme: "career" as const, event_type: "job_loss" as const, direction: "negative" as const, magnitude: "large" as const })),
    ];
    const [history] = generateBaselines([careerItem], "1990-06-15", "2026-10-04", outcomes);
    expect(history).toMatchObject({ event_type: "new_project", direction: "positive", magnitude: "small" });
    expect(history.basis).toContain("3 件");
  });

  it("B: 記録がなければ C と同じ推測で代用", () => {
    const [history, prior] = generateBaselines([loveItem], "1990-06-15", "2026-10-04", []);
    expect(history.event_type).toBe(prior.event_type);
    expect(history.basis).toContain("代用");
  });

  it("出来事の既定の方向", () => {
    expect(defaultDirection("health_issue")).toBe("negative");
    expect(defaultDirection("promotion")).toBe("positive");
    expect(defaultDirection("general_change")).toBe("change");
  });
});

const item = (over: Partial<EvaluableItem> = {}): EvaluableItem => ({
  theme: "career",
  event_type: "role_change",
  direction: "positive",
  magnitude: "medium",
  start_date: "2027-01-01",
  end_date: "2027-03-31",
  ...over,
});
const outcome: EvaluableOutcome = { occurred_at: "2027-02-10", theme: "career", event_type: "role_change", direction: "positive", magnitude: "medium" };

describe("同じ手順での自動採点", () => {
  it("期間が終わるまでは採点しない", () => {
    expect(autoScore(item(), [outcome], "2027-03-31")).toBeNull();
    expect(autoScore(item(), [outcome], "2027-04-01")).toEqual({ overall: 1, event_hit: true });
  });

  it("許容幅の外の出来事は使わず、出来事がなければ 0", () => {
    expect(autoScore(item(), [{ ...outcome, occurred_at: "2027-09-01" }], "2027-10-01")).toEqual({ overall: 0, event_hit: false });
  });

  it("10 件未満なら比較を出さない。10 件以上でグループごとに集計する", () => {
    const today = "2027-10-01";
    const small = compareWithBaselines({ model: [item()], history: [item()], prior: [item()] }, [outcome], today);
    expect(small.sufficient).toBe(false);
    expect(small.results[0].mean_overall).toBeNull();

    const tenModel = Array.from({ length: 10 }, () => item());
    const tenMiss = Array.from({ length: 10 }, () => item({ theme: "love", event_type: "new_encounter" }));
    const r = compareWithBaselines({ model: tenModel, history: tenMiss, prior: tenMiss }, [outcome], today);
    expect(r.sufficient).toBe(true);
    expect(r.results.map((x) => [x.group, x.event_hit_rate])).toEqual([
      ["model", 1],
      ["history", 0],
      ["prior", 0],
    ]);
  });
});
