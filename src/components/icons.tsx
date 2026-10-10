/** タブやメニューのアイコン (線画、currentColor で着色) */
type IconProps = { className?: string };
const base = (className = "h-6 w-6") => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const HomeIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M10 20v-5h4v5" />
  </svg>
);

export const CrystalBallIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="12" cy="10" r="7" />
    <path d="M7 20h10l-1.5-3h-7z" />
    <path d="M9.5 7.5a3 3 0 0 1 2.5-1.5" />
  </svg>
);

export const NotebookIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 3v18" />
    <path d="M12 8h4M12 12h4" />
  </svg>
);

export const ReflectIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M4 19V5" />
    <path d="M4 19h16" />
    <path d="M7.5 15l3.5-4 3 2.5L19 7" />
  </svg>
);

export const UserIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </svg>
);

export const TimelineIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M6 3v18" />
    <circle cx="6" cy="7" r="2" />
    <circle cx="6" cy="17" r="2" />
    <path d="M10 7h9M10 17h9M10 12h6" />
  </svg>
);

export const StarChartIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />
  </svg>
);

export const CalendarIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </svg>
);

export const HandIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12" />
    <path d="M11 11V5a1.5 1.5 0 0 1 3 0v6" />
    <path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a5.5 5.5 0 0 1-4.3-2.1L4.5 15a1.5 1.5 0 0 1 2.3-1.9L8 14.5" />
  </svg>
);
