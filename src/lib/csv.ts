import { downloadBlob } from "./utils";

function escape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCSV<T>(rows: T[], columns: { header: string; value: (r: T) => unknown }[]): string {
  const head = columns.map((c) => escape(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => escape(c.value(r))).join(",")).join("\n");
  return `${head}\n${body}`;
}

export function downloadCSV<T>(filename: string, rows: T[], columns: { header: string; value: (r: T) => unknown }[]) {
  const banner = "# AIVERA demo export — generated from synthetic demonstration data\n";
  downloadBlob(banner + toCSV(rows, columns), filename, "text/csv;charset=utf-8");
}
