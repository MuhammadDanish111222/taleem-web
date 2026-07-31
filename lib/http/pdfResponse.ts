export function sanitizePdfFilename(name: string): string {
  return name.replace(/[\/\x00-\x1F\x7F\x22\x27\x5C]/g, "_").trim() || "document.pdf";
}

export type ParsedByteRange = {
  valid: boolean;
  start?: number;
  end?: number;
  unsatisfiable?: boolean;
};

/**
 * Parses one HTTP byte range. Multi-range responses are intentionally not
 * supported because browsers and PDF viewers only need a single range here.
 */
export function parseByteRange(
  rangeValue: string | null,
  totalSize: number,
): ParsedByteRange {
  if (!rangeValue || !Number.isSafeInteger(totalSize) || totalSize <= 0) {
    return { valid: false };
  }

  const match = rangeValue.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return { valid: false };

  const startValue = match[1];
  const endValue = match[2];
  if (startValue === "" && endValue === "") return { valid: false };

  if (startValue === "") {
    const suffixLength = Number.parseInt(endValue, 10);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return { valid: false };
    }
    return {
      valid: true,
      start: Math.max(0, totalSize - suffixLength),
      end: totalSize - 1,
    };
  }

  const start = Number.parseInt(startValue, 10);
  if (!Number.isSafeInteger(start) || start < 0) return { valid: false };
  if (start >= totalSize) return { valid: true, unsatisfiable: true };

  if (endValue === "") {
    return { valid: true, start, end: totalSize - 1 };
  }

  const requestedEnd = Number.parseInt(endValue, 10);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) {
    return { valid: false };
  }

  return {
    valid: true,
    start,
    end: Math.min(requestedEnd, totalSize - 1),
  };
}
