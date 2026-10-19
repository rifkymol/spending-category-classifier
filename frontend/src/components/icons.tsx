// Inline SVG icons (no icon library). Decorative: always aria-hidden.
import type { SVGProps } from "react";

const base = {
  "aria-hidden": true,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

type Props = SVGProps<SVGSVGElement>;

export const CheckIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </svg>
);

export const ChevronDownIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="m6 8 4 4 4-4" />
  </svg>
);

export const UploadIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M10 13V3.5M6 7l4-4 4 4" />
    <path d="M3.5 12.5v2a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const LockIcon = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="4" y="9" width="12" height="8" rx="2" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </svg>
);

export const DownloadIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M10 3.5V13M6 9.5l4 4 4-4" />
    <path d="M4 16.5h12" />
  </svg>
);
