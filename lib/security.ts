import crypto from 'crypto';
import { NextResponse } from 'next/server';

export const DEVICE_COOKIE_NAME = 'wp_device';

const DEV_FALLBACK_SECRET = 'dev-insecure-fallback-secret-change-in-production';
let warnedAboutSecret = false;

function getSigningSecret(): string {
  const secret = process.env.APP_SECRET || process.env.INSTANT_APP_ADMIN_TOKEN;
  if (secret) return secret;

  if (!warnedAboutSecret && process.env.NODE_ENV === 'production') {
    warnedAboutSecret = true;
    console.warn('[security] APP_SECRET and INSTANT_APP_ADMIN_TOKEN are unset; using fallback secret.');
  }
  return DEV_FALLBACK_SECRET;
}

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLen), 'base64');
}

function hmacSign(data: string): string {
  const mac = crypto.createHmac('sha256', getSigningSecret()).update(data).digest();
  return toBase64Url(mac);
}

function hmacVerify(data: string, signature: string): boolean {
  try {
    const expected = Buffer.from(hmacSign(data), 'utf8');
    const actual = Buffer.from(signature, 'utf8');
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

interface TokenEnvelope<T> {
  p: T;
  pur: string;
  exp: number;
}

export function signToken<T>(payload: T, purpose: string, ttlMs: number): string {
  const envelope: TokenEnvelope<T> = {
    p: payload,
    pur: purpose,
    exp: Date.now() + ttlMs,
  };
  const body = toBase64Url(JSON.stringify(envelope));
  const sig = hmacSign(body);
  return `${body}.${sig}`;
}

export function verifyToken<T>(token: unknown, expectedPurpose: string): T | null {
  if (typeof token !== 'string' || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig || !hmacVerify(body, sig)) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(body).toString('utf8')) as TokenEnvelope<T>;
    if (!parsed || parsed.pur !== expectedPurpose) return null;
    if (typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
    return parsed.p;
  } catch {
    return null;
  }
}

export interface BorderlinePayload {
  text: string;
  embedding: number[];
  category?: string;
  matchId: string;
}

export interface UndoPayload {
  action: 'created' | 'merged';
  clusterId: string;
  problemId: string;
  previousCentroid?: number[];
  previousSubmissionCount?: number;
  previousTotalWeight?: number;
  previousUpdatedAt?: number;
}

const BORDERLINE_TTL_MS = 15 * 60 * 1000;
const UNDO_TTL_MS = 10 * 60 * 1000;

export function signBorderlineToken(payload: BorderlinePayload): string {
  return signToken(payload, 'borderline', BORDERLINE_TTL_MS);
}

export function verifyBorderlineToken(token: unknown): BorderlinePayload | null {
  const data = verifyToken<BorderlinePayload>(token, 'borderline');
  if (!data) return null;
  if (
    typeof data.text !== 'string' ||
    !Array.isArray(data.embedding) ||
    data.embedding.length === 0 ||
    typeof data.matchId !== 'string'
  ) {
    return null;
  }
  return data;
}

export function signUndoToken(payload: UndoPayload): string {
  return signToken(payload, 'undo', UNDO_TTL_MS);
}

export function verifyUndoToken(token: unknown): UndoPayload | null {
  const data = verifyToken<UndoPayload>(token, 'undo');
  if (!data) return null;
  if (
    (data.action !== 'created' && data.action !== 'merged') ||
    typeof data.clusterId !== 'string' ||
    typeof data.problemId !== 'string'
  ) {
    return null;
  }
  return data;
}

export function signDeviceId(deviceId: string): string {
  const sig = hmacSign(`device:${deviceId}`);
  return `${deviceId}.${sig}`;
}

export function verifyDeviceId(cookieValue: string | undefined | null): string | null {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [deviceId, sig] = parts;
  if (!deviceId || !sig || !/^[a-zA-Z0-9-]{8,64}$/.test(deviceId)) return null;
  if (!hmacVerify(`device:${deviceId}`, sig)) return null;
  return deviceId;
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    if (k === name) {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return null;
}

export function getOrCreateDeviceId(req: Request): {
  deviceId: string;
  cookieHeader?: string;
  isNew: boolean;
} {
  const rawCookie = parseCookie(req.headers.get('cookie'), DEVICE_COOKIE_NAME);
  const existing = verifyDeviceId(rawCookie);
  if (existing) {
    return { deviceId: existing, isNew: false };
  }

  const deviceId = crypto.randomUUID();
  const signed = signDeviceId(deviceId);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookieHeader = `${DEVICE_COOKIE_NAME}=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
  return { deviceId, cookieHeader, isNew: true };
}

export function attachDeviceCookie<T>(res: NextResponse<T>, cookieHeader?: string): NextResponse<T> {
  if (cookieHeader) {
    res.headers.append('Set-Cookie', cookieHeader);
  }
  return res;
}

function normalizeIpCandidate(raw: string | null): string | null {
  if (!raw) return null;
  let candidate = raw.split(',')[0]?.trim() || '';
  if (!candidate) return null;

  // Strip port on IPv4 like 1.2.3.4:12345
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.split(':')[0];
  }
  // Basic IPv4 or IPv6 sanity check
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(candidate)) {
    const octets = candidate.split('.').map(Number);
    if (octets.every((n) => n >= 0 && n <= 255)) return candidate;
    return null;
  }
  if (/^[0-9a-fA-F:]{2,45}$/.test(candidate) && candidate.includes(':')) {
    return candidate.toLowerCase();
  }
  return null;
}

export function getClientIp(req: Request): string {
  return (
    normalizeIpCandidate(req.headers.get('cf-connecting-ip')) ||
    normalizeIpCandidate(req.headers.get('x-real-ip')) ||
    normalizeIpCandidate(req.headers.get('x-forwarded-for')) ||
    'unknown'
  );
}

export function getSubnet24(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (ip.includes(':')) {
    const groups = ip.split(':').slice(0, 3);
    return `${groups.join(':')}::/48`;
  }
  return 'unknown';
}

export function getDeviceFingerprint(req: Request): string {
  const fp = req.headers.get('x-device-fp')?.trim() || '';
  if (!fp || !/^[a-zA-Z0-9_-]{4,128}$/.test(fp)) {
    return 'none';
  }
  return fp;
}

export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(
  token: unknown,
  ip: string
): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { ok: true };
  }
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, error: 'CAPTCHA verification required' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const body = new URLSearchParams({
      secret,
      response: token.trim(),
    });
    if (ip && ip !== 'unknown') {
      body.set('remoteip', ip);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { ok: false, error: 'CAPTCHA verification failed' };
    }
    const data = (await res.json()) as { success?: boolean };
    if (!data.success) {
      return { ok: false, error: 'CAPTCHA verification failed' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'CAPTCHA verification failed' };
  }
}

export function isValidHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeText(
  input: unknown,
  minLen: number,
  maxLen: number,
  fieldName = 'Input'
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== 'string') {
    return { ok: false, error: `${fieldName} must be a string` };
  }
  // Remove null bytes and non-printable control chars (preserve tabs/newlines/spaces)
  const cleaned = input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

  if (cleaned.length < minLen) {
    return { ok: false, error: `${fieldName} must be at least ${minLen} characters` };
  }
  if (cleaned.length > maxLen) {
    return { ok: false, error: `${fieldName} must be at most ${maxLen} characters` };
  }
  return { ok: true, value: cleaned };
}

export function sanitizeCategory(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const cleaned = input
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 40);
  if (!cleaned || cleaned.toLowerCase() === 'unknown') return undefined;
  return cleaned;
}
