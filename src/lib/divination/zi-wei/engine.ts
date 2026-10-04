/**
 * 紫微斗数 計算エンジン v1
 *
 * - 暦: 出生地タイムゾーン基準の旧暦 (定気法)。閏月は 15 日までを当月、16 日以降を翌月として扱う
 * - 命宮・身宮: 旧暦月と時支から
 * - 五行局: 命宮干支の納音
 * - 主星 14 星: 紫微星系 6 星・天府星系 8 星
 * - 補助星: 文昌・文曲・左輔・右弼・禄存・擎羊・陀羅
 * - 四化: 生年干 (庚干は 太陽禄・武曲権・太陰科・天同忌 の流派)
 * - 大限: 五行局の数から 10 年ごと (数え年)。陽男陰女は順行
 * - 流年: 年支の宮を流年命宮とし、流年干の四化が落ちる宮を示す
 *
 * 命盤は出生時刻に依存するため、時刻不明の場合は算出しない。
 */
import type { DivinationEngine, EngineInput, EngineResult } from "../types";
import { BRANCHES, pillarToCycle, STEMS, STEM_IS_YANG, cycleToPillar } from "../four-pillars/engine";
import { toLunar, type LunarDate } from "../calendar/lunar";

export const ZI_WEI_ENGINE_VERSION = "zi_wei_engine_v1";

const PALACE_NAMES = ["命宮", "兄弟宮", "夫妻宮", "子女宮", "財帛宮", "疾厄宮", "遷移宮", "交友宮", "官禄宮", "田宅宮", "福徳宮", "父母宮"];

/** 六十干支の納音五行 (2 干支ごと) */
const NAYIN = "金火木土金火水土金木水土火木水金火木土金火水土金木水土火木水";
const BUREAU: Record<string, { n: number; ja: string }> = {
  水: { n: 2, ja: "水二局" },
  木: { n: 3, ja: "木三局" },
  金: { n: 4, ja: "金四局" },
  土: { n: 5, ja: "土五局" },
  火: { n: 6, ja: "火六局" },
};

const SIHUA: Record<number, [string, string, string, string]> = {
  0: ["廉貞", "破軍", "武曲", "太陽"],
  1: ["天機", "天梁", "紫微", "太陰"],
  2: ["天同", "天機", "文昌", "廉貞"],
  3: ["太陰", "天同", "天機", "巨門"],
  4: ["貪狼", "太陰", "右弼", "天機"],
  5: ["武曲", "貪狼", "天梁", "文曲"],
  6: ["太陽", "武曲", "太陰", "天同"],
  7: ["巨門", "太陽", "文曲", "文昌"],
  8: ["天梁", "紫微", "左輔", "武曲"],
  9: ["破軍", "巨門", "太陰", "貪狼"],
};
const SIHUA_LABELS = ["化禄", "化権", "化科", "化忌"];
const LUCUN = [2, 3, 5, 6, 5, 6, 8, 9, 11, 0];

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** 紫微星の位置 (支インデックス) */
export function ziweiPosition(lunarDay: number, bureau: number): number {
  let x = 0;
  while ((lunarDay + x) % bureau !== 0) x++;
  const q = (lunarDay + x) / bureau;
  const base = 2 + q - 1; // 寅から q 番目
  return mod12(x % 2 === 1 ? base - x : base + x);
}

/** 主星・補助星の配置 (星名 → 支) */
export function placeStars(lunarMonth: number, lunarDay: number, hourBranch: number, yearStem: number, bureau: number) {
  const z = ziweiPosition(lunarDay, bureau);
  const f = mod12(4 - z);
  return {
    紫微: z,
    天機: mod12(z - 1),
    太陽: mod12(z - 3),
    武曲: mod12(z - 4),
    天同: mod12(z - 5),
    廉貞: mod12(z - 8),
    天府: f,
    太陰: mod12(f + 1),
    貪狼: mod12(f + 2),
    巨門: mod12(f + 3),
    天相: mod12(f + 4),
    天梁: mod12(f + 5),
    七殺: mod12(f + 6),
    破軍: mod12(f + 10),
    文昌: mod12(10 - hourBranch),
    文曲: mod12(4 + hourBranch),
    左輔: mod12(4 + lunarMonth - 1),
    右弼: mod12(10 - (lunarMonth - 1)),
    禄存: LUCUN[yearStem],
    擎羊: mod12(LUCUN[yearStem] + 1),
    陀羅: mod12(LUCUN[yearStem] - 1),
  } as Record<string, number>;
}

const MAIN_STAR_NAMES = new Set(["紫微", "天機", "太陽", "武曲", "天同", "廉貞", "天府", "太陰", "貪狼", "巨門", "天相", "天梁", "七殺", "破軍"]);

interface PalaceView {
  palace: string;
  branch: string;
  stem: string;
  main_stars: string[];
  other_stars: string[];
}

export interface ZiWeiData {
  lunar_birth: LunarDate;
  chart: {
    year_ganzhi: string;
    hour_branch: string;
    bureau: string;
    ming_palace_branch: string;
    shen_palace: string;
    palaces: PalaceView[];
    birth_sihua: Array<{ star: string; transformation: string; palace: string }>;
    decades: Array<{ palace: string; branch: string; from_age: number; to_age: number }> | null;
    current_decade_at_period_start: string | null;
  } | null;
  period: {
    start: string;
    end: string;
    annual: Array<{
      year: number;
      ganzhi: string;
      annual_ming_palace: string;
      annual_sihua: Array<{ star: string; transformation: string; palace: string | null }>;
    }>;
  };
}

function compute(input: EngineInput): EngineResult<ZiWeiData> {
  const { birth, period } = input;
  const caveats: string[] = [];
  const lunar = toLunar(birth.birthDate, birth.timeZone);

  // 閏月の扱い: 15 日までは当月、16 日以降は翌月
  let lunarMonth = lunar.month;
  if (lunar.isLeap && lunar.day > 15) lunarMonth = lunarMonth === 12 ? 1 : lunarMonth + 1;
  const yearPillar = cycleToPillar(lunar.year - 4);
  const yearStem = yearPillar.stem;

  const [sy, ey] = [Number(period.start.slice(0, 4)), Number(period.end.slice(0, 4))];
  const sihuaFor = (stem: number, branchOfStar: (s: string) => number | null, palaceAt: (b: number) => string | null) =>
    SIHUA[stem].map((star, i) => {
      const b = branchOfStar(star);
      return { star, transformation: SIHUA_LABELS[i], palace: b === null ? null : palaceAt(b) };
    });

  if (!birth.birthTime) {
    caveats.push("出生時刻が不明なため命盤 (命宮・十二宮・星の配置) は算出していない。");
    const annual = [];
    for (let y = sy; y <= ey; y++) {
      const p = cycleToPillar(y - 4);
      annual.push({ year: y, ganzhi: `${STEMS[p.stem]}${BRANCHES[p.branch]}`, annual_ming_palace: "不明", annual_sihua: sihuaFor(p.stem, () => null, () => null) });
    }
    return {
      method: "zi_wei_dou_shu",
      engine_version: ZI_WEI_ENGINE_VERSION,
      settings: { calendar: "lunar_birth_timezone", leap_month: "split_at_15" },
      caveats,
      data: { lunar_birth: lunar, chart: null, period: { start: period.start, end: period.end, annual } },
    };
  }

  const [hh, mm] = birth.birthTime.split(":").map(Number);
  const hourBranch = Math.floor((hh * 60 + mm + 60) / 120) % 12;
  const ming = mod12(2 + (lunarMonth - 1) - hourBranch);
  const shen = mod12(2 + (lunarMonth - 1) + hourBranch);

  // 五虎遁で各宮の干を決める
  const yinStem = ((yearStem % 5) * 2 + 2) % 10;
  const stemOf = (branch: number) => (yinStem + mod12(branch - 2)) % 10;
  const nayin = NAYIN[Math.floor(pillarToCycle(stemOf(ming), ming) / 2)];
  const bureau = BUREAU[nayin];

  const stars = placeStars(lunarMonth, lunar.day, hourBranch, yearStem, bureau.n);
  const palaceAt = (branch: number) => PALACE_NAMES[mod12(ming - branch)];
  const birthSihua = sihuaFor(yearStem, (s) => stars[s] ?? null, palaceAt).map((x) => ({ ...x, palace: x.palace ?? "—" }));
  const sihuaMark = new Map(birthSihua.map((s) => [s.star, s.transformation]));

  const palaces: PalaceView[] = PALACE_NAMES.map((name, i) => {
    const branch = mod12(ming - i);
    const here = Object.entries(stars)
      .filter(([, b]) => b === branch)
      .map(([s]) => (sihuaMark.has(s) ? `${s}(${sihuaMark.get(s)})` : s));
    return {
      palace: name,
      branch: BRANCHES[branch],
      stem: STEMS[stemOf(branch)],
      main_stars: here.filter((s) => MAIN_STAR_NAMES.has(s.slice(0, 2))),
      other_stars: here.filter((s) => !MAIN_STAR_NAMES.has(s.slice(0, 2))),
    };
  });

  let decades: NonNullable<ZiWeiData["chart"]>["decades"] = null;
  let currentDecade: string | null = null;
  if (birth.gender === "unspecified") {
    caveats.push("性別が未指定のため大限 (10 年ごとの運) は算出していない。");
  } else {
    const forward = STEM_IS_YANG(yearStem) === (birth.gender === "male");
    decades = Array.from({ length: 10 }, (_, i) => {
      const branch = mod12(ming + (forward ? i : -i));
      return { palace: palaceAt(branch), branch: BRANCHES[branch], from_age: bureau.n + 10 * i, to_age: bureau.n + 10 * i + 9 };
    });
    const kazoe = sy - lunar.year + 1;
    currentDecade = decades.find((d) => kazoe >= d.from_age && kazoe <= d.to_age)?.palace ?? null;
  }

  const annual = [];
  for (let y = sy; y <= ey; y++) {
    const p = cycleToPillar(y - 4);
    annual.push({
      year: y,
      ganzhi: `${STEMS[p.stem]}${BRANCHES[p.branch]}`,
      annual_ming_palace: palaceAt(p.branch),
      annual_sihua: sihuaFor(p.stem, (s) => stars[s] ?? null, palaceAt),
    });
  }

  return {
    method: "zi_wei_dou_shu",
    engine_version: ZI_WEI_ENGINE_VERSION,
    settings: {
      calendar: "lunar_birth_timezone",
      leap_month: "split_at_15",
      sihua_geng: "taiyang_wuqu_taiyin_tiantong",
      age: "kazoe",
      minor_stars: "wenchang,wenqu,zuofu,youbi,lucun,qingyang,tuoluo",
    },
    caveats,
    data: {
      lunar_birth: lunar,
      chart: {
        year_ganzhi: `${STEMS[yearPillar.stem]}${BRANCHES[yearPillar.branch]}`,
        hour_branch: BRANCHES[hourBranch],
        bureau: bureau.ja,
        ming_palace_branch: BRANCHES[ming],
        shen_palace: palaceAt(shen),
        palaces,
        birth_sihua: birthSihua,
        decades,
        current_decade_at_period_start: currentDecade,
      },
      period: { start: period.start, end: period.end, annual },
    },
  };
}

export const ziWeiEngine: DivinationEngine<ZiWeiData> = {
  method: "zi_wei_dou_shu",
  version: ZI_WEI_ENGINE_VERSION,
  compute,
};
