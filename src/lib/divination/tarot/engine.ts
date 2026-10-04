/**
 * タロット エンジン v1
 *
 * 引きは乱数シードから決定的に再現できる (シードは Snapshot に保存し、後から引き直せない)。
 * カードの象徴はキーワードとしてデータに含め、解釈は AI が行う。
 * 命式系と異なり、質問時点の状況と近未来 (概ね 3 か月以内) の意思決定支援に使う。
 */
import type { DivinationEngine, EngineInput, EngineResult } from "../types";

export const TAROT_ENGINE_VERSION = "tarot_engine_v1";
const NEAR_FUTURE_MONTHS = 3;

interface CardDef {
  id: string;
  name: string;
  arcana: "major" | "minor";
  upright: string;
  reversed: string;
}

const MAJORS: Array<[string, string, string]> = [
  ["愚者", "始まり・自由・冒険", "無計画・軽率"],
  ["魔術師", "創造・意志・スタート", "準備不足・空回り"],
  ["女教皇", "直感・知性・静観", "神経質・閉鎖的"],
  ["女帝", "豊かさ・愛情・実り", "過剰・停滞"],
  ["皇帝", "安定・責任・統率", "支配・頑固"],
  ["教皇", "信頼・伝統・助言", "形式主義・孤立"],
  ["恋人", "選択・調和・結びつき", "迷い・不一致"],
  ["戦車", "前進・勝利・行動力", "暴走・挫折"],
  ["力", "忍耐・内なる強さ", "自信喪失・無理"],
  ["隠者", "内省・探求", "孤立・閉じこもり"],
  ["運命の輪", "転機・好機・流れの変化", "停滞・タイミングのずれ"],
  ["正義", "公正・判断・バランス", "不公平・偏り"],
  ["吊るされた男", "試練・視点の転換・待機", "徒労・停滞"],
  ["死神", "終わりと再生・転換", "執着・変化への抵抗"],
  ["節制", "調和・節度・調整", "不均衡・浪費"],
  ["悪魔", "執着・誘惑・束縛", "解放・断ち切り"],
  ["塔", "突然の変化・崩壊", "緊張の持続・回避された混乱"],
  ["星", "希望・回復・理想", "失望・悲観"],
  ["月", "不安・曖昧・潜在意識", "不安の解消・真相"],
  ["太陽", "成功・喜び・明るさ", "停滞気味・過信"],
  ["審判", "復活・決断・再評価", "後悔・先延ばし"],
  ["世界", "完成・達成・統合", "未完成・中途半端"],
];

const SUITS: Array<[string, string, string]> = [
  ["wands", "ワンド", "情熱・行動・仕事"],
  ["cups", "カップ", "感情・愛情・人間関係"],
  ["swords", "ソード", "思考・対立・決断"],
  ["pentacles", "ペンタクル", "お金・物質・現実"],
];

const RANKS: Array<[string, string]> = [
  ["エース", "始まり"],
  ["2", "選択・均衡"],
  ["3", "発展・協力"],
  ["4", "安定"],
  ["5", "葛藤・喪失"],
  ["6", "調和・回復"],
  ["7", "試練・評価"],
  ["8", "動き・努力"],
  ["9", "達成目前"],
  ["10", "完成・重荷"],
  ["ペイジ", "知らせ・学び"],
  ["ナイト", "行動・移動"],
  ["クイーン", "受容・成熟"],
  ["キング", "統率・確立"],
];

export const DECK: CardDef[] = [
  ...MAJORS.map(([name, up, rev], i) => ({ id: `major_${i}`, name, arcana: "major" as const, upright: up, reversed: rev })),
  ...SUITS.flatMap(([suit, suitJa, theme]) =>
    RANKS.map(([rank, meaning], r) => ({
      id: `${suit}_${r + 1}`,
      name: `${suitJa}の${rank}`,
      arcana: "minor" as const,
      upright: `${theme}における${meaning}`,
      reversed: `${theme}における${meaning}の停滞・過不足`,
    })),
  ),
];

const SPREADS = {
  three_card: ["過去", "現在", "近未来"],
  decision: ["現状", "課題", "選んだ場合の流れ", "選ばなかった場合の流れ", "助言"],
} as const;
type SpreadId = keyof typeof SPREADS;

/** FNV-1a でシード文字列を 32bit 整数にする */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: シードから決定的な乱数列 */
function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawCards(seed: string, count: number) {
  const rand = mulberry32(hashSeed(seed));
  const order = DECK.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, count).map((i) => ({ card: DECK[i], reversed: rand() < 0.5 }));
}

export interface TarotData {
  spread: SpreadId;
  near_future_horizon_months: number;
  cards: Array<{ position: string; card_id: string; name: string; arcana: "major" | "minor"; orientation: "正位置" | "逆位置"; keywords: string }>;
  major_arcana_count: number;
}

function compute(input: EngineInput): EngineResult<TarotData> {
  const seed = input.context?.seed;
  if (!seed) throw new Error("タロットには乱数シードが必要です");
  const spread: SpreadId = input.context?.category === "DECISION" ? "decision" : "three_card";
  const positions = SPREADS[spread];
  const drawn = drawCards(seed, positions.length);
  const cards = drawn.map(({ card, reversed }, i) => ({
    position: positions[i],
    card_id: card.id,
    name: card.name,
    arcana: card.arcana,
    orientation: reversed ? ("逆位置" as const) : ("正位置" as const),
    keywords: reversed ? card.reversed : card.upright,
  }));

  return {
    method: "tarot",
    engine_version: TAROT_ENGINE_VERSION,
    settings: { deck: "rws_78", reversals: true, spread, rng: "fnv1a_mulberry32_fisher_yates", seed },
    caveats: [`タロットは質問時点の状況を映すもので、予測の対象はおおむね ${NEAR_FUTURE_MONTHS} か月以内の近未来とする。`],
    data: {
      spread,
      near_future_horizon_months: NEAR_FUTURE_MONTHS,
      cards,
      major_arcana_count: cards.filter((c) => c.arcana === "major").length,
    },
  };
}

export const tarotEngine: DivinationEngine<TarotData> = {
  method: "tarot",
  version: TAROT_ENGINE_VERSION,
  compute,
};
