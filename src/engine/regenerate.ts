import { DB } from '../db/connection';

import fs from 'fs';
import path from 'path';
import { SigilConfig } from '../types';
import { assembleContext, renderContextMarkdown } from './context';

const SIGIL_START = '<!-- SIGIL:START -->';
const SIGIL_END = '<!-- SIGIL:END -->';

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
