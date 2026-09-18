import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function uid(prefix="id"){ return `${prefix}-${Math.random().toString(36).slice(2,9)}`;}
export function nowIso(){ return new Date().toISOString();}

function utcIso(value: unknown): string | null {
  try {
    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === "number") {
      date = new Date(value);
    } else if (typeof value === "string") {
      const input = value.trim();
      if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(input)) return null;
      const normalized = input.includes("T") && !/(?:Z|[+-]\d{2}:\d{2})$/.test(input) ? `${input}Z` : input;
      date = new Date(normalized);
    } else {
      return null;
    }
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch {
    return null;
  }
}

export function formatUtcTimestamp(value?: unknown): string {
  const iso = utcIso(value);
  return iso ? `${iso} UTC` : "Unavailable";
}

export function formatUtcTime(value?: unknown): string {
  const iso = utcIso(value);
  return iso ? `${iso.split("T")[1].slice(0, 8)} UTC` : "Unavailable";
}

export function evidenceText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(evidenceText).filter(Boolean).join("; ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const parts = [record.type, record.source, record.detail].filter(
      (part): part is string => typeof part === "string" && part.length > 0
    );
    if (parts.length) return parts.join(": ");
    return JSON.stringify(value);
  }
  return "";
}
