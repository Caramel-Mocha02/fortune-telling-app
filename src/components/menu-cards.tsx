import Link from "next/link";
import type { NavItem } from "@/lib/navigation";

/** アイコン・名前・説明のカード (ホームのガイドや、ふりかえりの入り口に使う) */
export function MenuCards({ items }: { items: NavItem[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map(({ href, label, description, icon: Icon }) => (
        <li key={href}>
          <Link
            href={href}
            className="flex h-full items-start gap-3 rounded-2xl border border-border bg-surface/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Icon className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-medium">{label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
