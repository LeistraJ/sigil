import fs from 'fs';
import path from 'path';
import { SigilConfig } from '../types';

// ─── JSON Helpers ─────────────────────────────────────────────────────────────

export function parseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (val === null || val === undefined || val === '') return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJSON(val: unknown): string {
  return JSON.stringify(val);
}

// ─── Table Formatter ──────────────────────────────────────────────────────────

export function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return '(no results)';
  }

  const colWidths = headers.map((h, i) => {
    const maxRowWidth = rows.reduce((max, row) => {
      const cell = row[i] ?? '';
      return Math.max(max, cell.length);
    }, 0);
    return Math.max(h.length, maxRowWidth);
  });

  const divider = colWidths.map(w => '-'.repeat(w + 2)).join('+');
  const header = headers.map((h, i) => ` ${h.padEnd(colWidths[i])} `).join('|');
  const dataRows = rows.map(row =>
    row.map((cell, i) => ` ${(cell ?? '').padEnd(colWidths[i])} `).join('|')
  );

  return [
    divider,
    header,
    divider,
    ...dataRows,
    divider,
  ].join('\n');
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

// ─── String Helpers ───────────────────────────────────────────────────────────

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural ?? singular + 's'}`;
}

// ─── Sigil Init Guard ─────────────────────────────────────────────────────────

export interface SigilInitState {
  config: SigilConfig;
  dbPath: string;
  sigilDir: string;
  configPath: string;
}

export function requireSigilInit(): SigilInitState {
  const cwd = process.cwd();
  const sigilDir = path.join(cwd, '.sigil');
  const configPath = path.join(sigilDir, 'config.json');
  const dbPath = path.join(sigilDir, 'sigil.db');

  if (!fs.existsSync(sigilDir) || !fs.existsSync(configPath)) {
    console.error('Sigil not initialized. Run `sigil init` first.');
    process.exit(1);
  }

  let config: SigilConfig;
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(raw) as SigilConfig;
  } catch {
    console.error('Failed to read .sigil/config.json. It may be corrupted. Run `sigil init` to reinitialize.');
    process.exit(1);
  }

  return { config, dbPath, sigilDir, configPath };
}

// ─── Output Helpers ───────────────────────────────────────────────────────────

export function printSection(title: string, content: string): void {
  const bar = '─'.repeat(Math.max(title.length + 4, 40));
  console.log(`\n${bar}`);
  console.log(`  ${title}`);
  console.log(`${bar}`);
  console.log(content);
}

export function printKeyValue(pairs: Array<[string, string]>): void {
  const maxKey = pairs.reduce((max, [k]) => Math.max(max, k.length), 0);
  for (const [key, val] of pairs) {
    console.log(`  ${key.padEnd(maxKey)}  ${val}`);
  }
}
