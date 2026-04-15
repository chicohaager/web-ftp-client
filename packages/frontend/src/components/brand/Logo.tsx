interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 24, className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Web FTP Client"
    >
      <defs>
        <linearGradient id="wfc-logo-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#wfc-logo-bg)" />
      <rect x="8" y="16" width="16" height="32" rx="2.5" fill="#ffffff" />
      <rect x="40" y="16" width="16" height="32" rx="2.5" fill="#ffffff" />
      <g fill="#7dd3fc">
        <rect x="11" y="20" width="10" height="1.6" rx="0.8" />
        <rect x="11" y="23.4" width="7" height="1.6" rx="0.8" />
        <rect x="11" y="43" width="10" height="1.6" rx="0.8" />
        <rect x="11" y="46.4" width="6.5" height="1.6" rx="0.8" />
        <rect x="43" y="20" width="10" height="1.6" rx="0.8" />
        <rect x="43" y="23.4" width="8" height="1.6" rx="0.8" />
        <rect x="43" y="43" width="10" height="1.6" rx="0.8" />
        <rect x="43" y="46.4" width="7" height="1.6" rx="0.8" />
      </g>
      <g stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M25 26 H39" />
        <path d="M35.6 22.6 L39 26 L35.6 29.4" />
        <path d="M39 38 H25" />
        <path d="M28.4 34.6 L25 38 L28.4 41.4" />
      </g>
    </svg>
  );
}
