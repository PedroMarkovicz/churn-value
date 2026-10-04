/** Vite's hashed names: `name-XXXXXXXX.ext`, eight URL-safe base64 characters before the dot. */
const HASHED = /-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;

/** The names that carry no content hash, and so must not be cached for a year. */
export function unhashed(names: readonly string[]): string[] {
  return names.filter((name) => !HASHED.test(name));
}
