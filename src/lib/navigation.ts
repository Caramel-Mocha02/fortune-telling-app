import type { ComponentType } from "react";
import {
  CalendarIcon,
  CrystalBallIcon,
  HandIcon,
  HomeIcon,
  NotebookIcon,
  ReflectIcon,
  StarChartIcon,
  TimelineIcon,
  UserIcon,
} from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  /** ホームの「できること」に出す一文 */
  description: string;
  icon: ComponentType<{ className?: string }>;
}

/** 画面下 (スマホ) / 上 (パソコン) のタブ */
export const MAIN_TABS: NavItem[] = [
  { href: "/", label: "ホーム", icon: HomeIcon, description: "答え合わせのお知らせや、最近の占いをまとめて見られます。" },
  { href: "/ask", label: "占う", icon: CrystalBallIcon, description: "知りたいことを質問すると、いくつもの占いでこれからを予想します。" },
  { href: "/log", label: "記録する", icon: NotebookIcon, description: "実際に起きた出来事を書き留めます。答え合わせのもとになります。" },
  { href: "/reflect", label: "ふりかえり", icon: ReflectIcon, description: "これまでの占い、当たり具合、月や年のまとめを見られます。" },
  { href: "/profile", label: "マイページ", icon: UserIcon, description: "生年月日などの登録、手相の記録、データの管理ができます。" },
];

/** 「ふりかえり」の中のページ */
export const REFLECT_PAGES: NavItem[] = [
  { href: "/predictions", label: "これまでの占い", icon: TimelineIcon, description: "占った内容と、実際に起きた出来事を時間の順に並べて見比べます。" },
  { href: "/insights", label: "当たり具合", icon: StarChartIcon, description: "どの占いが、どんなことで、どのくらい当たっているかを確かめます。" },
  { href: "/reviews", label: "月・年のまとめ", icon: CalendarIcon, description: "ひと月・一年ごとに、占いと現実の答え合わせをふりかえります。" },
];

export const PALM_PAGE: NavItem = {
  href: "/palm",
  label: "手相の記録",
  icon: HandIcon,
  description: "これまでに登録した手相の写真と、読み取った線の様子を見られます。",
};

/** 現在のパスがどのタブに属するか */
export function activeTab(pathname: string): string {
  if (REFLECT_PAGES.some((p) => pathname.startsWith(p.href)) || pathname.startsWith("/reflect")) return "/reflect";
  if (pathname.startsWith("/palm")) return "/profile";
  const hit = MAIN_TABS.filter((t) => t.href !== "/").find((t) => pathname.startsWith(t.href));
  return hit?.href ?? "/";
}
