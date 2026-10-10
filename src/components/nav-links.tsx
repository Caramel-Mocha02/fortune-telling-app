"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTab, MAIN_TABS } from "@/lib/navigation";

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="absolute -top-1 right-0 min-w-4 rounded-full bg-gold px-1 text-center text-[10px] font-bold leading-4 text-[#1e1b4b]"
      aria-label={`答え合わせ ${count} 件`}
    >
      {count}
    </span>
  );
}

/** パソコン: ヘッダー内のタブ */
export function TopTabs({ dueCount }: { dueCount: number }) {
  const active = activeTab(usePathname());
  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {MAIN_TABS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
            active === href ? "bg-white/15 text-white" : "opacity-75 hover:bg-white/10 hover:opacity-100"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
          {href === "/" && <Badge count={dueCount} />}
        </Link>
      ))}
    </nav>
  );
}

/** スマホ: 画面下に固定のタブバー */
export function BottomTabs({ dueCount }: { dueCount: number }) {
  const active = activeTab(usePathname());
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <ul className="grid grid-cols-5">
        {MAIN_TABS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${active === href ? "text-accent" : "text-muted"}`}
            >
              <span className="relative">
                <Icon className="h-6 w-6" />
                {href === "/" && <Badge count={dueCount} />}
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
