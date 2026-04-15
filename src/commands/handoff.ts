import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { initDb } from '../db/connection';
import { buildHandoff } from '../engine/handoff';
import { requireSigilInit } from '../utils/format';
import { HandoffMode } from '../types';

export function registerHandoff(program: Command): void {
  program
    .command('handoff')
    .description('Generate a structured handoff document')
    .option('--mode <mode>', 'Handoff mode: agent (default), human, sprint')
    .option('--output <path>', 'Write to file instead of stdout')
    .action((options: { mode?: string; output?: string }) => {
      const { config, dbPath } = requireSigilInit();
      const db = initDb(dbPath);

      const validModes: HandoffMode[] = ['agent', 'human', 'sprint'];
      const mode: HandoffMode = validModes.includes(options.mode as HandoffMode)
        ? (options.mode as HandoffMode)
        : 'agent';

      const content = buildHandoff(db, config, mode);

      if (options.output) {
        const outPath = path.resolve(options.output);
        fs.writeFileSync(outPath, content, 'utf-8');
        console.log(`Handoff written to: ${outPath}`);
      } else {
        console.log(content);
      }
    });
}
