interface FolioDuetMarkProps {
  className?: string;
}

/** Paired pages joined by one synchronized reading-and-listening line. */
export function FolioDuetMark({ className }: FolioDuetMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="14" fill="#171a18" />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="12.5"
        fill="none"
        stroke="#8f79e8"
        strokeOpacity=".42"
        strokeWidth="2"
      />
      <path d="M10 16c8-2.4 15.2-.9 20 4.5V49c-5.3-4.8-12-6.2-20-4.2V16Z" fill="#f06e4f" />
      <path d="M34 20.5C38.8 15.1 46 13.6 54 16v28.8c-8-2-14.7-.6-20 4.2V20.5Z" fill="#fff7f2" />
      <path
        d="M11.5 32h6.1c3.2 0 3.6-5.8 6.7-5.8 3.4 0 3.8 11.2 7.7 11.2s4.4-8.4 7.7-8.4c3 0 3.5 3 6.7 3H53"
        fill="none"
        stroke="#171a18"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="53" cy="32" r="2.1" fill="#4de3d3" />
    </svg>
  );
}
