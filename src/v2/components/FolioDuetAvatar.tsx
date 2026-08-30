interface FolioDuetAvatarProps {
  className?: string;
  variant?: 'headshot' | 'reader';
}

/** FolioDuet's narrator portrait, shared by every compact brand placement. */
export function FolioDuetAvatar({ className, variant = 'headshot' }: FolioDuetAvatarProps) {
  const isReader = variant === 'reader';

  return (
    <img
      aria-hidden="true"
      className={className}
      src={isReader
        ? '/brand/folioduet-narrator-v1.png'
        : '/brand/folioduet-narrator-avatar-v1.png'}
      alt=""
      width={isReader ? 740 : 128}
      height={isReader ? 1181 : 128}
      draggable={false}
    />
  );
}
