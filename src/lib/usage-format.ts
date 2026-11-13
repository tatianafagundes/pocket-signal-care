import type { UsageBucket, UsageUnit } from "@/services/model";

/*
 * Pure formatting helpers for the usage cards — no React, no i18n (the unit label and the state
 * words are translated by the caller). Kept here so the number work is unit-tested once and the
 * ring and the card read the same figures.
 */

/**
 * Short numeric label for a quantity value, at most one decimal with trailing zeros dropped
 * ("3.80" → "3.8", "10.0" → "10"). With a locale, the decimal mark follows it ("1,8" in de-AT).
 */
export function formatQuantity(value: number, locale?: string): string {
  const rounded = Math.round(value * 10) / 10;
  if (locale) return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rounded);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Remaining / total as 0..1 — what meters fill to (prepaid users read "what's left"); 0 when total
 * is missing or non-positive.
 */
export function remainingFraction(bucket: UsageBucket): number {
  const total = bucket.total?.value;
  const remaining = bucket.remaining?.value;
  if (total === undefined || total <= 0 || remaining === undefined) return 0;
  return Math.max(0, Math.min(1, remaining / total));
}

/** The unit token key suffix — GB/min/sms — used by the caller to pick a localized unit label. */
export function unitOf(bucket: UsageBucket): UsageUnit | undefined {
  return bucket.total?.unit ?? bucket.remaining?.unit;
}
