import { describe, expect, it } from "vitest";
import { DECK, drawCards, tarotEngine } from "../tarot/engine";
import { compareObservations, palmistryEngine } from "../palmistry/engine";
import type { PalmObservation } from "../palmistry/observation";
import { route } from "@/lib/routing/router";
import { bestOutcomeByItem, findCandidates } from "@/lib/evaluation/match";
import type { BirthData } from "../types";

const birth: BirthData = {
  birthDate: "1990-06-15",
  birthTime: "08:30",
  timeZone: "Asia/Tokyo",
  placeName: null,
  latitude: null,
  longitude: null,
  gender: "female",
};
const period = { start: "2026-10-04", end: "2027-01-03" };

describe("タロット", () => {
  it("78 枚のデッキ", () => {
    expect(DECK).toHaveLength(78);
    expect(new Set(DECK.map((c) => c.id)).size).toBe(78);
  });

  it("同じシードなら同じ引き、違うシードなら違う引き", () => {
    expect(drawCards("seed-a", 5)).toEqual(drawCards("seed-a", 5));
    expect(drawCards("seed-a", 5)).not.toEqual(drawCards("seed-b", 5));
    const ids = drawCards("seed-a", 10).map((d) => d.card.id);
    expect(new Set(ids).size).toBe(10); // 重複なし
  });

  it("意思決定の質問は 5 枚、それ以外は 3 枚", () => {
    expect(tarotEngine.compute({ birth, period, context: { seed: "x", category: "DECISION" } }).data.cards).toHaveLength(5);
    expect(tarotEngine.compute({ birth, period, context: { seed: "x", category: "LOVE" } }).data.cards).toHaveLength(3);
  });

  it("シードがなければエラー", () => {
    expect(() => tarotEngine.compute({ birth, period })).toThrow();
  });
});

const line = (over: Partial<PalmObservation["lines"]["life"]> = {}) => ({
  visible: true,
  length: "medium" as const,
  depth: "moderate" as const,
  features: [] as PalmObservation["lines"]["life"]["features"],
  ...over,
});
const obs = (lines: Partial<PalmObservation["lines"]> = {}): PalmObservation => ({
  image_quality: "good",
  usable: true,
  hand_shape: "water",
  lines: { life: line(), head: line(), heart: line(), fate: line({ visible: false }), sun: line({ visible: false }), ...lines },
  notes: "",
});

describe("手相", () => {
  it("前回からの変化を検出する", () => {
    const changes = compareObservations(obs(), obs({ head: line({ depth: "deep", features: ["fork"] }), fate: line() }));
    expect(changes).toEqual([
      { line: "頭脳線", change: "濃くなった" },
      { line: "頭脳線", change: "特徴が現れた: fork" },
      { line: "運命線", change: "見えるようになった" },
    ]);
  });

  it("手ごとに最新と前回を比較し、判別できない画像は除く", () => {
    const r = palmistryEngine.compute({
      birth,
      period,
      context: {
        palmReadings: [
          { id: "r1", hand: "right", captured_on: "2026-01-01", observation: obs() },
          { id: "r2", hand: "right", captured_on: "2026-07-01", observation: obs({ life: line({ length: "long" }) }) },
          { id: "r3", hand: "left", captured_on: "2026-07-01", observation: { ...obs(), usable: false } },
        ],
      },
    });
    expect(r.data.hands).toHaveLength(1);
    expect(r.data.hands[0].latest.reading_id).toBe("r2");
    expect(r.data.hands[0].changes_since_previous).toEqual([{ line: "生命線", change: "長くなった" }]);
  });

  it("手相画像がなければルーターがスキップ理由を記録する", () => {
    const r = route("CURRENT_STATE", { palmistry: "手相画像が未登録" });
    expect(r.primary).toEqual(["tarot", "western_astrology"]);
    expect(r.skipped).toEqual([{ method: "palmistry", role: "primary", reason: "手相画像が未登録" }]);
    expect(route("CURRENT_STATE").primary).toEqual(["palmistry", "tarot", "western_astrology"]);
  });
});

describe("自動照合", () => {
  const items = [
    { id: "i1", theme: "career" as const, event_type: "role_change" as const, direction: "positive" as const, magnitude: "medium" as const, start_date: "2027-04-01", end_date: "2027-09-30" },
    { id: "i2", theme: "love" as const, event_type: "new_encounter" as const, direction: "positive" as const, magnitude: "small" as const, start_date: "2027-04-01", end_date: "2027-06-30" },
  ];
  const outcomes = [
    { id: "o1", occurred_at: "2027-05-10", theme: "career" as const, event_type: "new_project" as const, direction: "positive" as const, magnitude: "medium" as const },
    { id: "o2", occurred_at: "2028-05-10", theme: "career" as const, event_type: "role_change" as const, direction: "positive" as const, magnitude: "medium" as const },
    { id: "o3", occurred_at: "2027-05-10", theme: "health" as const, event_type: "health_issue" as const, direction: "negative" as const, magnitude: "small" as const },
  ];

  it("時期が大きくずれたものやテーマ違いは候補にしない", () => {
    const c = findCandidates(items, outcomes);
    expect(c.map((x) => [x.item.id, x.outcome.id])).toEqual([["i1", "o1"]]);
  });

  it("項目ごとの最有力候補", () => {
    expect(bestOutcomeByItem(items, outcomes)).toEqual({ i1: "o1" });
  });
});
