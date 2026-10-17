/** 西暦の年を和暦で表す (改元のあった年は両方を併記する) */
const ERAS = [
  { name: "令和", start: [2019, 5, 1] },
  { name: "平成", start: [1989, 1, 8] },
  { name: "昭和", start: [1926, 12, 25] },
  { name: "大正", start: [1912, 7, 30] },
  { name: "明治", start: [1868, 1, 25] },
] as const;

function eraYear(era: (typeof ERAS)[number], year: number): string {
  const n = year - era.start[0] + 1;
  return `${era.name}${n === 1 ? "元" : n}年`;
}

export function warekiOfYear(year: number): string {
  // どの元号も年の途中で始まっているので、1 月 1 日時点の元号 + その年に始まった元号を並べる
  const atNewYear = ERAS.find((e) => e.start[0] < year);
  const startedThisYear = ERAS.find((e) => e.start[0] === year);
  return [atNewYear, startedThisYear]
    .filter((e): e is (typeof ERAS)[number] => Boolean(e))
    .map((e) => eraYear(e, year))
    .join("・");
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
