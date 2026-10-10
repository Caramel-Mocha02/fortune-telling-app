"use client";
import { useState } from "react";

/** 待ち時間のミニゲーム「星合わせ」(神経衰弱) */
const SYMBOLS = [
  { glyph: "☀", name: "太陽" },
  { glyph: "☾", name: "月" },
  { glyph: "★", name: "星" },
  { glyph: "♡", name: "ハート" },
  { glyph: "✦", name: "きらめき" },
  { glyph: "◆", name: "ダイヤ" },
];

interface Card {
  id: number;
  symbol: number;
}

function shuffled(): Card[] {
  const cards = SYMBOLS.flatMap((_, i) => [i, i]).map((symbol, id) => ({ id, symbol }));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function StarMatchGame({ onPlay }: { onPlay?: () => void }) {
  const [cards, setCards] = useState<Card[]>(shuffled);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);
  const cleared = matched.size === SYMBOLS.length;

  function flip(index: number) {
    if (locked || open.includes(index) || matched.has(cards[index].symbol)) return;
    onPlay?.();
    const next = [...open, index];
    setOpen(next);
    if (next.length < 2) return;

    setMoves((m) => m + 1);
    const [a, b] = next;
    if (cards[a].symbol === cards[b].symbol) {
      setMatched(new Set([...matched, cards[a].symbol]));
      setOpen([]);
    } else {
      setLocked(true);
      setTimeout(() => {
        setOpen([]);
        setLocked(false);
      }, 800);
    }
  }

  function restart() {
    setCards(shuffled());
    setOpen([]);
    setMatched(new Set());
    setMoves(0);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface/90 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-serif font-bold">待っている間に「星合わせ」</p>
        <p className="text-xs text-muted">
          {cleared ? `クリア！ ${moves} 手` : `同じ絵柄を2枚そろえよう ・ ${moves} 手`}
        </p>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {cards.map((card, i) => {
          const faceUp = open.includes(i) || matched.has(card.symbol);
          const isMatched = matched.has(card.symbol);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => flip(i)}
              aria-label={faceUp ? SYMBOLS[card.symbol].name : "裏向きのカード"}
              className={`grid aspect-[3/4] place-items-center rounded-xl border text-2xl transition ${
                faceUp
                  ? `border-gold bg-[#fbf6e9] text-[#3b2a78] dark:bg-[#2a2357] dark:text-[#e8c56b] ${isMatched ? "opacity-60" : ""}`
                  : "border-transparent text-transparent"
              }`}
              style={
                faceUp
                  ? undefined
                  : { background: "radial-gradient(circle at 50% 40%, #3b2a78 0%, #1e1b4b 70%)", boxShadow: "inset 0 0 0 2px rgb(232 197 107 / 0.35)" }
              }
            >
              {faceUp ? SYMBOLS[card.symbol].glyph : "✧"}
            </button>
          );
        })}
      </div>
      {cleared && (
        <button type="button" onClick={restart} className="mt-3 text-sm text-accent underline">
          もう一度あそぶ
        </button>
      )}
    </div>
  );
}
