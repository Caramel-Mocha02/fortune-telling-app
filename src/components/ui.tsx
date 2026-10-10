import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-surface/90 p-5 shadow-sm backdrop-blur ${className}`}>{children}</section>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-bold">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "warn" }) {
  const tones = {
    default: "bg-background text-muted border-border",
    accent: "bg-accent-soft text-accent border-transparent",
    warn: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900",
  };
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function ErrorMessage({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{message}</p>;
}

export function buttonClass(variant: "primary" | "secondary" = "primary") {
  return variant === "primary"
    ? "inline-flex items-center justify-center rounded-full bg-accent px-5 py-2 text-sm font-medium text-white shadow-sm shadow-accent/30 hover:opacity-90 disabled:opacity-50 dark:text-[#140f2e]"
    : "inline-flex items-center justify-center rounded-full border border-border bg-surface px-5 py-2 text-sm hover:bg-background disabled:opacity-50";
}

export function formatDate(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", "/");
}
