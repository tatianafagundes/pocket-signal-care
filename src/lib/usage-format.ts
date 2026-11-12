import type { UsageBucket, UsageUnit } from "@/services/model";

/*
 * Pure formatting helpers for the usage cards — no React, no i18n (the unit label and the state
 * words are translated by the caller). Kept here so the number work is unit-tested once and the
 * ring and the card read the same figures.
 */

/** Short numeric label for a quantity value: trims trailing zeros ("3.80" → "3.8", "10.0" → "10"). */
export function formatQuantity(value: number): string {
  // One decimal is enough for GB; voice/SMS are whole. Round to 1dp then drop a trailing ".0".
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Consumed / total as 0..1; 0 when total is missing or non-positive (can't form a fraction). */
export function consumedFraction(bucket: UsageBucket): number {
  const total = bucket.total?.value;
  const remaining = bucket.remaining?.value;
  if (total === undefined || total <= 0 || remaining === undefined) return 0;
  const consumed = total - remaining;
  return Math.max(0, Math.min(1, consumed / total));
}

/** Consumed amount value (total − remaining), clamped at 0; undefined when not metered. */
export function consumedValue(bucket: UsageBucket): number | undefined {
  const total = bucket.total?.value;
  const remaining = bucket.remaining?.value;
  if (total === undefined || remaining === undefined) return undefined;
  return Math.max(0, total - remaining);
}

/** The unit token key suffix — GB/min/sms — used by the caller to pick a localized unit label. */
export function unitOf(bucket: UsageBucket): UsageUnit | undefined {
  return bucket.total?.unit ?? bucket.remaining?.unit;
}
