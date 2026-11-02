export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI?: Ai;
  APP_URL: string;
  APP_NAME: string;
  MAIL_PROVIDER: 'brevo' | 'resend' | 'gas' | 'log';
  MAIL_FROM: string;
  MAIL_FROM_NAME: string;
  BREVO_API_KEY?: string;
  RESEND_API_KEY?: string;
  GAS_URL?: string;
  GAS_TOKEN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  EXTRACTOR_TOKEN?: string;
}

export interface SessionUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
}
