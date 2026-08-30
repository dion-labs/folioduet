interface FolioDuetMarkProps {
  className?: string;
}

/** FolioDuet's living bookmark mascot, used as the primary product mark. */
export function FolioDuetMark({ className }: FolioDuetMarkProps) {
  return (
    <img
      aria-hidden="true"
      className={className}
      src="/brand/folioduet-mascot-monochrome-v6.png"
      alt=""
      width="128"
      height="128"
      draggable={false}
    />
  );
}
