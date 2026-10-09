import type { SVGProps } from 'react'

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

type P = SVGProps<SVGSVGElement>

export const IconUndo = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
)
export const IconRedo = (p: P) => (
  <svg {...base} {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
)
export const IconFrame = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
)
export const IconCamera = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
)
export const IconLink = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  </svg>
)
export const IconGauge = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.5 17a8 8 0 1 1 15 0" />
    <path d="m12 13 4-4" />
    <circle cx="12" cy="13" r="1" />
  </svg>
)
export const IconClose = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)
export const IconChevron = (p: P) => (
  <svg {...base} viewBox="0 0 12 12" strokeWidth={1.4} {...p}>
    <path d="M2.5 4.5 6 8l3.5-3.5" />
  </svg>
)
export const IconBag = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 8h14l-1 12H6z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
)
export const IconCheck = (p: P) => (
  <svg {...base} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

/* line drawings for option tiles (pen-scale silhouettes, drawn from the model) */
export const ClipGlyph = ({ id, ...p }: P & { id: 'classic' | 'wheel' | 'minimal' }) => (
  <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden {...p}>
    <rect x="14" y="4" width="10" height="38" rx="2" opacity={0.35} />
    {id === 'classic' && (
      <>
        <path d="M18 6h8.5c1 0 1.5.6 1.5 1.5V30" />
        <circle cx="27.5" cy="32" r="2" />
      </>
    )}
    {id === 'wheel' && (
      <>
        <path d="M18 6h8.5c1 0 1.5.6 1.5 1.5V27" />
        <circle cx="27.5" cy="31" r="3" />
        <path d="M27.5 28.5v5M25 31h5" opacity={0.6} />
      </>
    )}
    {id === 'minimal' && <path d="M18 6h10v26h-2V8h-8" />}
  </svg>
)

export const FillGlyph = ({ id, ...p }: P & { id: 'converter' | 'cartridge' }) => (
  <svg viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden {...p}>
    {id === 'converter' ? (
      <>
        <rect x="17" y="6" width="10" height="5" rx="1" />
        <rect x="17.5" y="11" width="9" height="22" rx="1" />
        <path d="M18.5 20h7" />
        <rect x="18" y="33" width="8" height="6" rx="1" />
        <path d="M18 35h8M18 37h8" opacity={0.6} />
      </>
    ) : (
      <>
        <path d="M18 8h8v4l1 1v20c0 3-2 5-5 5s-5-2-5-5V13l1-1z" />
        <path d="M18.5 18h7" opacity={0.6} />
      </>
    )}
  </svg>
)
