/** 三日月と星のロゴ */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="var(--logo-bg)" />
      <path d="M19.5 7.5a9 9 0 1 0 5 15.6A7.2 7.2 0 0 1 19.5 7.5Z" fill="var(--gold)" />
      <path d="M22.5 8.2l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="var(--gold)" />
      <circle cx="25.5" cy="15" r=".9" fill="var(--gold)" />
    </svg>
  );
}
