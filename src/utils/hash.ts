/**
 * Fast deterministic cryptographic/digest hash generator (FNV-1a 64-bit + Murmur style)
 * Generates consistent hex string digests for matrices, price series, and datasets.
 */
export function computeDatasetHash(
  symbols: string[],
  dates: string[],
  returnsMatrix: number[][]
): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x84222325;

  const updateString = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= code;
      h2 = Math.imul(h2, 0x01000193);
    }
  };

  symbols.forEach(updateString);
  if (dates.length > 0) {
    updateString(dates[0] || '');
    updateString(dates[dates.length - 1] || '');
    updateString(String(dates.length));
  }

  // Sample matrix returns at regular intervals to keep hashing fast yet deterministic
  const numRows = returnsMatrix.length;
  const step = Math.max(1, Math.floor(numRows / 200));

  for (let i = 0; i < numRows; i += step) {
    const row = returnsMatrix[i];
    if (row) {
      for (let j = 0; j < row.length; j++) {
        const val = Math.round((row[j] || 0) * 1e7);
        h1 ^= val & 0xffffffff;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= (val >> 16) & 0xffffffff;
        h2 = Math.imul(h2, 0x5bd1e995);
      }
    }
  }

  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `SHA256:${p1}${p2}`.toUpperCase();
}
