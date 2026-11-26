export function parseNuancesField(raw?: string | null): string[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
  } catch {
    return [];
  }
}

export function appendNuanceList(
  existingRaw: string | undefined,
  title: string,
  newText: string
): string {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of [title, ...parseNuancesField(existingRaw), newText]) {
    const clean = candidate.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }

  return JSON.stringify(result);
}
