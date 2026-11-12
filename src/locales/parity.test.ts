import { describe, expect, it } from "vitest";

import en from "@/locales/en.json";
import deAT from "@/locales/de-AT.json";

/*
 * Locale parity guard. Every key present in en.json must exist in de-AT.json and vice versa —
 * a missing key ships an English string into a German screen (or a dangling key). This test is
 * the guard the review asked for: it fails the build before that can happen. It also checks that
 * each leaf's interpolation placeholders ({{...}}) match across locales, so a translated string
 * can't silently drop a {{price}} / {{name}} the UI relies on.
 */

type Json = string | { [k: string]: Json };

function leafKeys(obj: Json, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  return Object.keys(obj).flatMap((k) => leafKeys(obj[k] ?? "", prefix ? `${prefix}.${k}` : k));
}

function get(obj: Json, path: string): Json | undefined {
  return path.split(".").reduce<Json | undefined>((acc, k) => {
    if (acc && typeof acc === "object") return acc[k];
    return undefined;
  }, obj);
}

function placeholders(s: string): string[] {
  return (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, "")).sort();
}

describe("locale parity (en ↔ de-AT)", () => {
  const enKeys = leafKeys(en as Json).sort();
  const deKeys = leafKeys(deAT as Json).sort();

  it("has the same set of keys in both locales", () => {
    expect(deKeys).toEqual(enKeys);
  });

  it("has matching interpolation placeholders for every shared key", () => {
    for (const key of enKeys) {
      const enVal = get(en as Json, key);
      const deVal = get(deAT as Json, key);
      if (typeof enVal === "string" && typeof deVal === "string") {
        expect(placeholders(deVal), `placeholders differ for "${key}"`).toEqual(
          placeholders(enVal),
        );
      }
    }
  });
});
