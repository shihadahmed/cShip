function IconBase({ className = 'h-4 w-4', children, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function LogoMark(props) {
  return (
    <IconBase {...props}>
      <path d="M4.5 15.5c2.1 1.1 4.4 1.7 7.5 1.7s5.4-.6 7.5-1.7" />
      <path d="M7 15V9.8L12 5l5 4.8V15" />
      <path d="M9.5 15v-3.6h5V15" />
      <path d="M18.6 5.4h.01" />
    </IconBase>
  );
}

export function OverviewIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </IconBase>
  );
}

export function ProjectsIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4.5 7.8 7.5 4.3 7.5-4.3" />
      <path d="M12 12.1V21" />
    </IconBase>
  );
}

export function DeploymentsIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3v12" />
      <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
      <path d="M5 15.5v3.2c0 .7.6 1.3 1.3 1.3h11.4c.7 0 1.3-.6 1.3-1.3v-3.2" />
    </IconBase>
  );
}

export function SettingsIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <circle cx="16" cy="7" r="2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <circle cx="8" cy="17" r="2" />
    </IconBase>
  );
}

export function PlusIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconBase>
  );
}

export function GithubIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7m12 5.4v-3.1c0-.9.1-1.3-.4-1.8 2.4-.3 4.9-1.2 4.9-5.3a4.2 4.2 0 0 0-1.2-2.9 3.9 3.9 0 0 0-.1-2.9s-1-.3-3.2 1.2a11 11 0 0 0-5.8 0C7.1 5.4 6.1 5.7 6.1 5.7a3.9 3.9 0 0 0-.1 2.9 4.2 4.2 0 0 0-1.2 2.9c0 4.1 2.5 5 4.9 5.3-.3.3-.5.8-.5 1.3V22" />
    </IconBase>
  );
}

export function TerminalIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="m7.5 9 2.5 2.5L7.5 14" />
      <path d="M13 14h3.5" />
    </IconBase>
  );
}

export function DatabaseIcon(props) {
  return (
    <IconBase {...props}>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6" />
      <path d="M4.5 11.5v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6" />
    </IconBase>
  );
}

export function CpuIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 3.5v3M15 3.5v3M9 17.5v3M15 17.5v3M3.5 9h3M3.5 15h3M17.5 9h3M17.5 15h3" />
    </IconBase>
  );
}

export function ActivityIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
    </IconBase>
  );
}

export function ArrowUpRightIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </IconBase>
  );
}

export function SunIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </IconBase>
  );
}

export function MoonIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
    </IconBase>
  );
}

export function CheckIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </IconBase>
  );
}

export function ClockIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </IconBase>
  );
}

export function ServerIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="4.5" width="17" height="6" rx="1.5" />
      <rect x="3.5" y="13.5" width="17" height="6" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </IconBase>
  );
}

export function ZapIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z" />
    </IconBase>
  );
}

export function GitBranchIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="6.5" cy="5.5" r="2" />
      <circle cx="6.5" cy="18.5" r="2" />
      <circle cx="17.5" cy="8.5" r="2" />
      <path d="M6.5 7.5v9" />
      <path d="M17.5 10.5c0 3-2.2 5-5 5h-6" />
    </IconBase>
  );
}

export function ShieldIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3.5 19 6v5.5c0 4.3-2.9 7.4-7 9-4.1-1.6-7-4.7-7-9V6l7-2.5Z" />
      <path d="m9 12 2 2 4-4" />
    </IconBase>
  );
}

export function ChevronRightIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m9 6 6 6-6 6" />
    </IconBase>
  );
}

export function HardDriveIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="5.5" width="17" height="6" rx="1.5" />
      <rect x="3.5" y="12.5" width="17" height="6" rx="1.5" />
      <path d="M7 8.5h.01M7 15.5h.01" />
    </IconBase>
  );
}

export function LogoutIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </IconBase>
  );
}

export function LoaderIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </IconBase>
  );
}

export function ChevronLeftIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m15 18-6-6 6-6" />
    </IconBase>
  );
}

export function ExternalLinkIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </IconBase>
  );
}

export function TrashIcon(props) {
  return (
    <IconBase {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </IconBase>
  );
}

export function XIcon(props) {
  return (
    <IconBase {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </IconBase>
  );
}

export function ChevronUpIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m18 15-6-6-6 6" />
    </IconBase>
  );
}

export function ChevronDownIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

export function SearchIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </IconBase>
  );
}

export function CheckCircleIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </IconBase>
  );
}

export function XCircleIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </IconBase>
  );
}

export function PauseIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </IconBase>
  );
}

export function RotateCcwIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </IconBase>
  );
}
