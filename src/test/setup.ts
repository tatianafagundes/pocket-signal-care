import "@testing-library/jest-dom/vitest";

/*
 * In-memory Web Storage polyfill. This Node/jsdom combo does not provide a working
 * window.localStorage (Node's experimental localStorage needs --localstorage-file, and jsdom's is
 * not active here), so the app's localStorage persistence — and tests that clear it in afterEach —
 * would throw. Provide a spec-compliant in-memory Storage for both localStorage and sessionStorage
 * so tests exercise the real persistence code path. Only defined when missing (never shadow a real
 * one a future env provides).
 */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  } as Storage;
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  const existing = (window as unknown as Record<string, unknown>)[name];
  // Replace if missing OR if the env's stub throws on use (the "not available" experimental case).
  let usable = false;
  try {
    if (existing) {
      (existing as Storage).getItem("__probe__");
      usable = true;
    }
  } catch {
    usable = false;
  }
  if (!usable) {
    Object.defineProperty(window, name, {
      configurable: true,
      writable: true,
      value: createMemoryStorage(),
    });
  }
}

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
