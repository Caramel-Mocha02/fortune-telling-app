"use client";
import { useEffect, useState } from "react";

/** 工程ごとのひとこと。解釈 (1 分ほど) の間は言葉を切り替えて、止まって見えないようにする */
const MESSAGES: string[][] = [
  ["あなたの質問を受け取りました"],
  ["どんなことを知りたいのか、読み取っています"],
  ["生まれた日の星の位置を調べています", "生まれ年・月・日の干支をひもといています"],
  [
    "星の動きを読んでいます",
    "いくつもの占いの声を聞き比べています",
    "共通して見えてくることを探しています",
    "これから起きそうなことを、時期といっしょに整理しています",
    "あとで答え合わせしやすい言葉にまとめています",
    "もうすぐです。もう少しだけお待ちください",
  ],
  ["結果を書き留めています"],
];

const STARS = [
  { top: "8%", left: "18%", size: 6, delay: "0s" },
  { top: "18%", left: "82%", size: 4, delay: ".6s" },
  { top: "70%", left: "8%", size: 5, delay: "1.2s" },
  { top: "84%", left: "74%", size: 7, delay: ".3s" },
  { top: "45%", left: "94%", size: 4, delay: "1.8s" },
  { top: "40%", left: "2%", size: 3, delay: ".9s" },
];

export function FortuneWaiting({ stageIndex, elapsedSeconds }: { stageIndex: number; elapsedSeconds: number }) {
  const lines = MESSAGES[Math.max(0, stageIndex)] ?? MESSAGES[0];
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 6000);
    return () => clearInterval(t);
  }, []);

  // 工程が変わったら、その工程の最初のひとことから
  const [shownStage, setShownStage] = useState(stageIndex);
  const [offset, setOffset] = useState(0);
  if (shownStage !== stageIndex) {
    setShownStage(stageIndex);
    setOffset(tick);
  }
  const message = lines[Math.min(tick - offset, lines.length - 1)];

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-6 py-10 text-center text-[#f3eefe]"
      style={{ background: "radial-gradient(circle at 50% 35%, #3b2a78 0%, #1e1b4b 55%, #0f0d24 100%)" }}
      role="status"
      aria-live="polite"
    >
      {STARS.map((s, i) => (
        <span
          key={i}
          className="twinkle absolute rounded-full bg-[#f6e7b8]"
          style={{ top: s.top, left: s.left, width: s.size, height: s.size, animationDelay: s.delay }}
          aria-hidden="true"
        />
      ))}

      <div className="relative mx-auto mb-6 h-40 w-40" aria-hidden="true">
        {/* 星がめぐる軌道 */}
        <div className="orbit absolute inset-0 rounded-full border border-white/15">
          <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[#e8c56b] shadow-[0_0_12px_#e8c56b]" />
        </div>
        <div className="orbit-reverse absolute inset-5 rounded-full border border-white/10">
          <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#c9bdf7] shadow-[0_0_10px_#c9bdf7]" />
        </div>
        {/* 水晶玉 */}
        <div
          className="crystal absolute inset-10 rounded-full"
          style={{ background: "radial-gradient(circle at 35% 30%, #ffffff 0%, #d9cff9 18%, #8a75d6 55%, #3b2a78 100%)" }}
        />
        <div className="absolute bottom-6 left-1/2 h-3 w-20 -translate-x-1/2 rounded-[50%] bg-[#e8c56b]/60 blur-[1px]" />
      </div>

      <p key={message} className="fade-in min-h-[3rem] font-serif text-lg">
        {message}
      </p>

      <div className="mt-5 flex justify-center gap-2" aria-label={`5 段階中 ${stageIndex + 1} 段階目`}>
        {MESSAGES.map((_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full transition-colors ${i <= stageIndex ? "bg-[#e8c56b]" : "bg-white/25"}`}
          />
        ))}
      </div>
      <p className="mt-4 text-xs text-white/60">
        {elapsedSeconds} 秒 ・ 1 分ほどかかります。この画面を閉じずにお待ちください
      </p>
    </div>
  );
}
