let cachedFingerprintPromise: Promise<string> | null = null;

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function computeFingerprint(): Promise<string> {
  if (typeof window === 'undefined') {
    return 'ssr';
  }

  const parts: string[] = [];

  try {
    parts.push(`${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 0}`);
    parts.push(String(window.devicePixelRatio || 1));
  } catch {
    parts.push('screen-err');
  }

  try {
    parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || 'tz-unknown');
  } catch {
    parts.push('tz-err');
  }

  try {
    parts.push(navigator.language || '');
    parts.push((navigator.languages || []).join(','));
    parts.push(navigator.userAgent || '');
    parts.push(String(navigator.hardwareConcurrency || 0));
  } catch {
    parts.push('nav-err');
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#f60';
      ctx.fillRect(10, 4, 40, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('world-problems-fp', 2, 12);
      parts.push(canvas.toDataURL().slice(-64));
    }
  } catch {
    parts.push('canvas-err');
  }

  const raw = parts.join('|');

  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoded = new TextEncoder().encode(raw);
      const digest = await crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fall back to FNV-1a below
  }

  return `${fnv1aHex(raw)}${fnv1aHex(raw.split('').reverse().join(''))}`;
}

export function getDeviceFingerprint(): Promise<string> {
  if (!cachedFingerprintPromise) {
    cachedFingerprintPromise = computeFingerprint();
  }
  return cachedFingerprintPromise;
}

export async function getApiHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const fp = await getDeviceFingerprint();
  return {
    'Content-Type': 'application/json',
    'x-device-fp': fp,
    ...extra,
  };
}
