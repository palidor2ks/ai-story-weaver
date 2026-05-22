import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

const trimZero = (s: string) => s.replace(/\.0$/, '');

/**
 * Compact currency: $1.2B, $266M, $4.9M, $15K, $42.
 * Returns "—" for null/undefined/NaN.
 */
export function formatCompactCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${trimZero((abs / 1_000_000_000).toFixed(1))}B`;
  if (abs >= 10_000_000) return `${sign}$${Math.round(abs / 1_000_000)}M`;
  if (abs >= 1_000_000) return `${sign}$${trimZero((abs / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/**
 * Full currency for tooltips: $266,908,815.
 */
export function formatFullCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
