import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db/connection';
import { assembleContext, renderContextMarkdown } from '../engine/context';
import { requireSigilInit, nowIso } from '../utils/format';
import { ContextProfile } from '../types';

const PROFILES: ContextProfile[] = ['builder', 'reviewer', 'planner', 'debugger'];

export function registerExport(program: Command): void {
  const exp = program
    .command('export')
    .description('Export project context');

  exp
    .command('context')
    .description('Export context file for an AI agent')
    .option('--profile <profile>', 'Context profile: builder (default), reviewer, planner, debugger')
    .option('--output <path>', 'Output file path (default: stdout)')
    .option('--no-token-limit', 'Remove token budget limit (full context)')
    .action((options: { profile?: string; output?: string; tokenLimit?: boolean }) => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const profile: ContextProfile = (PROFILES.includes(options.profile as ContextProfile))
        ? options.profile as ContextProfile
        : 'builder';

      const tokenBudget = options.tokenLimit === false ? 999999 : config.max_context_tokens;
      const ctx = assembleContext(db, config, profile, tokenBudget);
      const markdown = renderContextMarkdown(ctx);

      if (options.output) {
        const outPath = path.resolve(options.output);
        fs.writeFileSync(outPath, markdown, 'utf-8');

        // Log export
        db.prepare(`
          INSERT INTO exports (id, type, profile, output_path, created_at)
          VALUES (?, 'context', ?, ?, ?)
        `).run(uuidv4(), profile, outPath, nowIso());

        console.log(`Context exported to: ${outPath}`);
        console.log(`Profile: ${profile} | ~${ctx.totalTokens} tokens${ctx.truncated ? ' (truncated)' : ''}`);
      } else {
        console.log(markdown);
      }
    });
}
