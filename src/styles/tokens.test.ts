import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * Contrast rules from design/DESIGN.md, checked against the real values in tokens.css:
 * warning is a graphic (>=3:1 on white, WCAG 1.4.11); text colours need >=4.5:1 (WCAG 1.4.3).
 */

const css = readFileSync(resolve(__dirname, "tokens.css"), "utf8");

/** Value of `--name` in the given block (":root" base, or a [data-brand] block). */
function token(name: string, brand?: string): string {
  const blockStart = brand ? css.indexOf(`[data-brand="${brand}"]`) : css.indexOf(":root {");
  const block = css.slice(blockStart, css.indexOf("}", blockStart));
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  const value = match?.[1];
  if (value) return value;
  if (brand) return token(name);
  throw new Error(`token --${name} not found`);
}

/** "#rrggbb" → [r, g, b] in 0..255. */
function rgb(hex: string): [number, number, number] {
  const channel = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return [channel(1), channel(3), channel(5)];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("design tokens", () => {
  it("should keep the warning colour at least 3:1 on white so the amber mark is visible", () => {
    expect(contrast(token("warning"), token("surface"))).toBeGreaterThanOrEqual(3);
  });

  it("should keep the warning colour amber, not brown (hue 30-45°, lightness above 38%)", () => {
    const hex = token("warning");
    const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const hue = max === r ? (60 * ((g - b) / (max - min)) + 360) % 360 : 0;
    expect(hue).toBeGreaterThanOrEqual(30);
    expect(hue).toBeLessThanOrEqual(45);
    expect(lightness).toBeGreaterThan(0.38);
  });

  it("should keep dark text at least 4.5:1 on the warning tint", () => {
    expect(contrast(token("text-primary"), token("warning-tint"))).toBeGreaterThanOrEqual(4.5);
  });

  it("should keep danger and success words at least 4.5:1 on their tints", () => {
    expect(contrast(token("danger"), token("danger-tint"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("success"), token("success-tint"))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["drei", "dreigo"])("should keep %s text and links at least 4.5:1 on white", (brand) => {
    const white = token("surface");
    expect(contrast(token("text-primary", brand), white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("text-secondary", brand), white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("accent-ink", brand), white)).toBeGreaterThanOrEqual(4.5);
  });

  it("should keep the base quiet tint neutral grey with no brand hue", () => {
    const channels = rgb(token("surface-tint"));
    expect(Math.max(...channels) - Math.min(...channels)).toBeLessThanOrEqual(6);
  });
});
