/**
 * Safe UUID v4 generation with fallback support.
 * Attempts crypto.randomUUID() first, then falls back to getRandomValues-based implementation,
 * then to timestamp+random string as last resort.
 */

/**
 * Generate a UUID v4 string with safe fallback for environments without crypto.randomUUID.
 * @returns A UUID v4 string
 */
export function generateId(): string {
  // Try native crypto.randomUUID (available in modern browsers and Node.js >= 15.7)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // Fallback: RFC4122 v4 UUID using crypto.getRandomValues
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return uuidv4WithGetRandomValues()
  }

  // Final fallback: timestamp + random string (deterministic enough for tests)
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Generate RFC4122 v4 UUID using crypto.getRandomValues.
 * Based on standard UUID v4 algorithm.
 */
function uuidv4WithGetRandomValues(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  // Set version to 4 (bits 12-15 of time_hi_and_version)
  bytes[6] = (bytes[6] & 0x0f) | 0x40

  // Set variant to RFC4122 (bits 6-7 of clock_seq_hi_and_reserved)
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  // Format as UUID string
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}
