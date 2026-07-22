export const CURRENT_SEARCH_SCHEMA_VERSION = 1;

export const MIN_TOKEN_LENGTH = 2;
export const MIN_PREFIX_LENGTH = 2;
export const MAX_PREFIX_LENGTH = 12;
export const MAX_TOKENS_PER_TITLE = 30;

export function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(title: string): string[] {
  const normalized = normalizeText(title);
  if (!normalized) return [];

  const rawTokens = normalized.split(" ").filter((t) => t.length >= MIN_TOKEN_LENGTH);
  const truncatedTokens = rawTokens.slice(0, MAX_TOKENS_PER_TITLE);
  
  // Return deduplicated list preserving order
  return Array.from(new Set(truncatedTokens));
}

export function generatePrefixes(tokens: string[]): string[] {
  const prefixSet = new Set<string>();

  for (const token of tokens) {
    if (token.length < MIN_PREFIX_LENGTH) continue;

    const maxPrefixLen = Math.min(token.length, MAX_PREFIX_LENGTH);
    for (let len = MIN_PREFIX_LENGTH; len <= maxPrefixLen; len++) {
      prefixSet.add(token.slice(0, len));
    }

    // Always include the full token itself if it exceeds MAX_PREFIX_LENGTH
    if (token.length > MAX_PREFIX_LENGTH) {
      prefixSet.add(token);
    }
  }

  return Array.from(prefixSet);
}

export function computeSearchFields(
  title: string,
  schemaVersion: number = CURRENT_SEARCH_SCHEMA_VERSION
): {
  searchTokens: string[];
  searchPrefixes: string[];
  searchSchemaVersion: number;
} {
  const searchTokens = tokenize(title);
  const searchPrefixes = generatePrefixes(searchTokens);

  return {
    searchTokens,
    searchPrefixes,
    searchSchemaVersion: schemaVersion,
  };
}
