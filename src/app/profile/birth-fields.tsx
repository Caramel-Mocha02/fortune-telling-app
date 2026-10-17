"use client";
import { useState } from "react";
import { daysInMonth, warekiOfYear } from "@/lib/domain/wareki";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 生年月日と出生時刻を「年・月・日」「時・分」の選択で入力する。
 * 送信は従来どおり birth_date (YYYY-MM-DD) と birth_time (HH:MM) の hidden 項目で行う。
 */
export function BirthFields({ initialDate, initialTime }: { initialDate: string | null; initialTime: string | null }) {
  const [y0, m0, d0] = initialDate ? initialDate.split("-").map(Number) : [0, 0, 0];
  const [year, setYear] = useState(y0);
  const [month, setMonth] = useState(m0);
  const [day, setDay] = useState(d0);
  const [h0, mi0] = initialTime ? initialTime.slice(0, 5).split(":").map(Number) : [-1, -1];
  const [hour, setHour] = useState(h0);
  const [minute, setMinute] = useState(mi0);
  const [timeUnknown, setTimeUnknown] = useState(initialDate !== null && initialTime === null);

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 1920 + 1 }, (_, i) => thisYear - i);
  const maxDay = year && month ? daysInMonth(year, month) : 31;
  const safeDay = Math.min(day, maxDay);
  const birthDate = year && month && safeDay ? `${year}-${pad(month)}-${pad(safeDay)}` : "";
  const birthTime = !timeUnknown && hour >= 0 && minute >= 0 ? `${pad(hour)}:${pad(minute)}` : "";

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">生年月日</legend>
        <input type="hidden" name="birth_date" value={birthDate} />
        <div className="grid grid-cols-[1.6fr_1fr_1fr] gap-2">
          <select aria-label="生まれた年" value={year || ""} onChange={(e) => setYear(Number(e.target.value))} required>
            <option value="">年</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}年 ({warekiOfYear(y)})
              </option>
            ))}
          </select>
          <select aria-label="生まれた月" value={month || ""} onChange={(e) => setMonth(Number(e.target.value))} required>
            <option value="">月</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
          <select aria-label="生まれた日" value={safeDay || ""} onChange={(e) => setDay(Number(e.target.value))} required>
            <option value="">日</option>
            {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}日
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">生まれた時刻</legend>
        <input type="hidden" name="birth_time" value={birthTime} />
        {timeUnknown && <input type="hidden" name="time_unknown" value="on" />}
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="生まれた時" value={hour >= 0 ? hour : ""} disabled={timeUnknown} required={!timeUnknown} onChange={(e) => setHour(Number(e.target.value))}>
            <option value="">時</option>
            {Array.from({ length: 24 }, (_, i) => i).map((h) => (
              <option key={h} value={h}>
                {h}時 ({h < 12 ? `午前${h}` : `午後${h - 12}`}時)
              </option>
            ))}
          </select>
          <select aria-label="生まれた分" value={minute >= 0 ? minute : ""} disabled={timeUnknown} required={!timeUnknown} onChange={(e) => setMinute(Number(e.target.value))}>
            <option value="">分</option>
            {Array.from({ length: 60 }, (_, i) => i).map((m) => (
              <option key={m} value={m}>
                {m}分
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 font-normal text-muted">
          <input type="checkbox" className="w-auto" checked={timeUnknown} onChange={(e) => setTimeUnknown(e.target.checked)} />
          時刻が分からない
        </label>
        <p className="text-xs text-muted">母子手帳に書かれていることが多いです。分からなくても占えます。</p>
      </fieldset>
    </div>
  );
}
