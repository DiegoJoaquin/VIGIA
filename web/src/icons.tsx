// Íconos de trazo, dibujados a mano en una grilla de 24.
type P = { size?: number; className?: string };

const S = ({ size = 22, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
);

export const IconToday = (p: P) => (
  <S {...p}><rect x="3.5" y="4.5" width="17" height="16" rx="3.5" /><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4" /><circle cx="12" cy="15" r="2" fill="currentColor" stroke="none" /></S>
);
export const IconCalendar = (p: P) => (
  <S {...p}><rect x="3.5" y="4.5" width="17" height="16" rx="3.5" /><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M7.5 13.5h1M11.5 13.5h1M15.5 13.5h1M7.5 17h1M11.5 17h1" /></S>
);
export const IconProjects = (p: P) => (
  <S {...p}><path d="M12 3.5 3.5 8 12 12.5 20.5 8 12 3.5Z" /><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" /></S>
);
export const IconSettings = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></S>
);
export const IconPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IconCheck = (p: P) => <S {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></S>;
export const IconChevron = (p: P) => <S {...p}><path d="m9 5 7 7-7 7" /></S>;
export const IconBack = (p: P) => <S {...p}><path d="m15 5-7 7 7 7" /></S>;
export const IconClose = (p: P) => <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>;
export const IconDoc = (p: P) => (
  <S {...p}><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8L14 3.5Z" /><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" /></S>
);
export const IconImage = (p: P) => (
  <S {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.75" /><path d="m20.5 16-4.5-4.5-8 8" /></S>
);
export const IconClip = (p: P) => (
  <S {...p}><path d="m20 11.5-7.8 7.8a5 5 0 0 1-7-7l8.2-8.3a3.3 3.3 0 0 1 4.7 4.7L9.8 17a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4" /></S>
);
export const IconBell = (p: P) => (
  <S {...p}><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15L6 16.5Z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></S>
);
export const IconMail = (p: P) => (
  <S {...p}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></S>
);
export const IconLink = (p: P) => (
  <S {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></S>
);
export const IconAlert = (p: P) => (
  <S {...p}><path d="M10.3 4.3 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17h.01" /></S>
);
export const IconBolt = (p: P) => <S {...p}><path d="M13 2.5 4.5 13.5H12L11 21.5l8.5-11H12l1-8Z" /></S>;
export const IconShield = (p: P) => (
  <S {...p}><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></S>
);
export const IconPin = (p: P) => (
  <S {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></S>
);
export const IconUpload = (p: P) => <S {...p}><path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5M4.5 15v3a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5v-3" /></S>;
export const IconFolder = (p: P) => (
  <S {...p}><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10Z" /></S>
);
export const IconPhone = (p: P) => (
  <S {...p}><rect x="6.5" y="2.5" width="11" height="19" rx="3" /><path d="M10.5 18.5h3" /></S>
);
export const IconSpark = (p: P) => (
  <S {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></S>
);
export const IconEye = (p: P) => (
  <S {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></S>
);
export const IconEyeOff = (p: P) => (
  <S {...p}><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17" /></S>
);
