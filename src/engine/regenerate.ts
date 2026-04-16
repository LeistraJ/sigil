import { DB } from '../db/connection';

import fs from 'fs';
import path from 'path';
import { SigilConfig } from '../types';
import { assembleContext, renderContextMarkdown } from './context';

const SIGIL_START = '<!-- SIGIL:START -->';
const SIGIL_END = '<!-- SIGIL:END -->';
const SESSION_START = '<!-- SIGIL_SESSION:START -->';
const SESSION_END = '<!-- SIGIL_SESSION:END -->';

export function regenerateContextFiles(db: DB, config: SigilConfig): void {
  const cwd = process.cwd();
  const ctx = assembleContext(db, config, 'builder');
  const markdown = renderContextMarkdown(ctx);

  // Write to each agent file
  for (const agentFile of config.agent_files) {
    const filePath = path.join(cwd, agentFile);
    writeAgentFile(filePath, markdown);
  }

  // Write full (no token limit) context to .sigil/exports/context-latest.md
  const fullCtx = assembleContext(db, config, 'builder', 999999);
  const fullMarkdown = renderContextMarkdown(fullCtx);
  const exportsDir = path.join(cwd, '.sigil', 'exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(exportsDir, 'context-latest.md'), fullMarkdown, 'utf-8');
}

export function injectSessionBlock(cwd: string, agentFiles: string[], sessionContent: string): void {
  const block = `${SESSION_START}\n${sessionContent}\n${SESSION_END}`;

  for (const agentFile of agentFiles) {
    const filePath = path.join(cwd, agentFile);
    if (!fs.existsSync(filePath)) continue;

    const existing = fs.readFileSync(filePath, 'utf-8');

    if (existing.includes(SESSION_START) && existing.includes(SESSION_END)) {
      const startIdx = existing.indexOf(SESSION_START);
      const endIdx = existing.indexOf(SESSION_END) + SESSION_END.length;
      const updated = existing.slice(0, startIdx) + block + existing.slice(endIdx);
      fs.writeFileSync(filePath, updated, 'utf-8');
    } else {
      // Append before SIGIL:START if present, otherwise at end
      if (existing.includes(SIGIL_START)) {
        const idx = existing.indexOf(SIGIL_START);
        const updated = existing.slice(0, idx) + block + '\n\n' + existing.slice(idx);
        fs.writeFileSync(filePath, updated, 'utf-8');
      } else {
        fs.writeFileSync(filePath, existing.trimEnd() + '\n\n' + block + '\n', 'utf-8');
      }
    }
  }
}

function writeAgentFile(filePath: string, sigilContent: string): void {
  if (!fs.existsSync(filePath)) {
    // New file — write directly
    fs.writeFileSync(filePath, sigilContent, 'utf-8');
    return;
  }

  const existing = fs.readFileSync(filePath, 'utf-8');

  // If file already has SIGIL markers, replace between them
  if (existing.includes(SIGIL_START) && existing.includes(SIGIL_END)) {
    const startIdx = existing.indexOf(SIGIL_START);
    const endIdx = existing.indexOf(SIGIL_END) + SIGIL_END.length;
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx);
    const updated = `${before}${SIGIL_START}\n${sigilContent}\n${SIGIL_END}${after}`;
    fs.writeFileSync(filePath, updated, 'utf-8');
    return;
  }

  // File exists without markers — check if it has non-Sigil content
  const trimmed = existing.trim();
  if (trimmed.length === 0) {
    // Empty file
    fs.writeFileSync(filePath, sigilContent, 'utf-8');
    return;
  }

  // Has existing user content — wrap Sigil block and preserve user content
  const updated = `${trimmed}\n\n${SIGIL_START}\n${sigilContent}\n${SIGIL_END}\n`;
  fs.writeFileSync(filePath, updated, 'utf-8');
}
