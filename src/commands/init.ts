import { Command } from 'commander';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { version } from '../../package.json';
import { initDb } from '../db/connection';
import { applySchema } from '../db/schema';
import { seedUniversal } from '../db/seeds/universal';
import { seedFrontend } from '../db/seeds/frontend';
import { seedBackend } from '../db/seeds/backend';
import { seedFullstack } from '../db/seeds/fullstack';
import { seedLibrary } from '../db/seeds/library';
import { regenerateContextFiles } from '../engine/regenerate';
import { SigilConfig, ProjectType } from '../types';
import { nowIso } from '../utils/format';

const PROJECT_TYPES: ProjectType[] = ['general', 'frontend', 'backend', 'fullstack', 'library'];

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

async function detectProjectStructure(cwd: string): Promise<SigilConfig['structure']> {
  const structure: SigilConfig['structure'] = {
    feature_dirs: [],
    shared_dirs: [],
    test_dirs: [],
    data_layer_dirs: [],
    presentation_dirs: [],
    service_dirs: [],
    adapter_dirs: [],
  };

  const check = (dir: string) => fs.existsSync(path.join(cwd, dir));

  // Feature dirs
  if (check('src/features')) structure.feature_dirs.push('src/features/*');
  if (check('src/modules')) structure.feature_dirs.push('src/modules/*');
  if (check('features')) structure.feature_dirs.push('features/*');

  // Shared dirs
  if (check('src/shared')) structure.shared_dirs.push('src/shared/*');
  if (check('src/lib')) structure.shared_dirs.push('src/lib/*');
  if (check('src/common')) structure.shared_dirs.push('src/common/*');
  if (check('lib')) structure.shared_dirs.push('lib/*');

  // Test dirs
  if (check('tests')) structure.test_dirs.push('tests/*');
  if (check('test')) structure.test_dirs.push('test/*');
  if (check('__tests__')) structure.test_dirs.push('__tests__/*');
  if (check('src/__tests__')) structure.test_dirs.push('src/__tests__/*');
  structure.test_dirs.push('**/__tests__/*');
  structure.test_dirs.push('**/*.test.ts');
  structure.test_dirs.push('**/*.spec.ts');

  // Data layer
  if (check('src/db')) structure.data_layer_dirs.push('src/db/*');
  if (check('src/repositories')) structure.data_layer_dirs.push('src/repositories/*');
  if (check('src/models')) structure.data_layer_dirs.push('src/models/*');
  if (check('src/database')) structure.data_layer_dirs.push('src/database/*');

  // Presentation
  if (check('src/components')) structure.presentation_dirs.push('src/components/*');
  if (check('src/pages')) structure.presentation_dirs.push('src/pages/*');
  if (check('src/views')) structure.presentation_dirs.push('src/views/*');
  if (check('src/routes')) structure.presentation_dirs.push('src/routes/*');
  if (check('pages')) structure.presentation_dirs.push('pages/*');
  if (check('app')) structure.presentation_dirs.push('app/*');

  // Service
  if (check('src/services')) structure.service_dirs.push('src/services/*');
  if (check('src/api')) structure.service_dirs.push('src/api/*');

  // Adapters
  if (check('src/adapters')) structure.adapter_dirs.push('src/adapters/*');
  if (check('src/integrations')) structure.adapter_dirs.push('src/integrations/*');

  return structure;
}

function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

function installGitHook(cwd: string): void {
  const hookPath = path.join(cwd, '.git', 'hooks', 'post-commit');
  const hookContent = `#!/bin/sh
# Sigil auto-ingest — skipped silently if sigil is not installed
command -v sigil >/dev/null 2>&1 && sigil ingest --quiet --agent=git-hook
`;
  fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
}

function updateGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  const entries = ['.sigil/logs/', '.sigil/artifacts/'];

  let content = '';
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf-8');
  }

  const toAdd = entries.filter(e => !content.includes(e));
  if (toAdd.length > 0) {
    const addition = (content.endsWith('\n') ? '' : '\n') +
      '# Sigil local artifacts\n' +
      toAdd.join('\n') + '\n';
    fs.writeFileSync(gitignorePath, content + addition, 'utf-8');
  }
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize Sigil in the current project')
    .action(async () => {
      const cwd = process.cwd();
      const sigilDir = path.join(cwd, '.sigil');

      // Guard: already initialized
      if (fs.existsSync(sigilDir) && fs.existsSync(path.join(sigilDir, 'config.json'))) {
        console.log('Sigil already initialized. Run `sigil status` to see project state.');
        process.exit(0);
      }

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      try {
        // 1. Ask project name
        const defaultName = path.basename(cwd);
        const nameInput = await ask(rl, `Project name (${defaultName}): `);
        const projectName = nameInput.trim() || defaultName;

        // 2. Ask project type
        console.log(`\nProject type: ${PROJECT_TYPES.map((t, i) => `${i + 1}) ${t}`).join('  ')}`);
        const typeInput = await ask(rl, 'Select type (1-5, default: 1): ');
        const typeIdx = parseInt(typeInput.trim(), 10);
        const projectType: ProjectType = (typeIdx >= 1 && typeIdx <= 5)
          ? PROJECT_TYPES[typeIdx - 1]
          : 'general';

        rl.close();

        console.log(`\nInitializing Sigil for "${projectName}" (${projectType})...`);

        // 3. Create directory structure
        const dirs = [
          sigilDir,
          path.join(sigilDir, 'exports'),
          path.join(sigilDir, 'logs'),
          path.join(sigilDir, 'artifacts'),
        ];
        for (const dir of dirs) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // 4. Init DB + schema
        const dbPath = path.join(sigilDir, 'sigil.db');
        const db = initDb(dbPath);
        applySchema(db);

        // 5. Insert project row
        const projectId = uuidv4();
        const now = nowIso();

        db.prepare(`
          INSERT INTO projects (id, name, type, description, created_at, updated_at)
          VALUES (?, ?, ?, '', ?, ?)
        `).run(projectId, projectName, projectType, now, now);

        // 6. Insert meta
        const metaInsert = db.prepare(`
          INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES (?, ?, ?)
        `);
        metaInsert.run('project_id', projectId, now);
        metaInsert.run('sigil_version', version, now);
        metaInsert.run('initialized_at', now, now);
        metaInsert.run('last_ingest_ref', '', now);
        metaInsert.run('last_ingest_timestamp', '', now);
        metaInsert.run('last_check_score', '', now);

        // 7. Seed database
        console.log('  Seeding governance rules...');
        seedUniversal(db);
        switch (projectType) {
          case 'frontend':  seedFrontend(db); break;
          case 'backend':   seedBackend(db);  break;
          case 'fullstack': seedFullstack(db); break;
          case 'library':   seedLibrary(db);  break;
          // 'general' gets only universal rules
        }

        // 8. Detect project structure + write config
        const structure = await detectProjectStructure(cwd);
        const config: SigilConfig = {
          project: { name: projectName, type: projectType, description: '' },
          thresholds: {
            max_file_lines: 300,
            max_function_lines: 50,
            debt_aging_critical_days: 7,
            debt_aging_high_days: 30,
            debt_aging_stale_days: 90,
          },
          structure,
          cross_feature_allowlist: [],
          max_context_tokens: 8000,
          agent_files: ['CLAUDE.md', 'AGENTS.md'],
          auto_sync: { enabled: true, on: ['ingest'] },
        };

        fs.writeFileSync(
          path.join(sigilDir, 'config.json'),
          JSON.stringify(config, null, 2),
          'utf-8'
        );

        // 9. Generate context files
        console.log('  Generating context files...');
        regenerateContextFiles(db, config);

        // 10. Git hook
        if (isGitRepo(cwd)) {
          const hookRl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const hookAnswer = await new Promise<string>(resolve =>
            hookRl.question('  Install git post-commit hook for auto-ingest? (y/N): ', resolve)
          );
          hookRl.close();

          if (hookAnswer.trim().toLowerCase() === 'y') {
            installGitHook(cwd);
            console.log('  Git hook installed.');
          }

          // 11. Update .gitignore
          updateGitignore(cwd);
        }

        // 12. Count what was seeded
        const ruleCount = (db.prepare('SELECT COUNT(*) as n FROM architecture_rules').get() as { n: number }).n;
        const constraintCount = (db.prepare('SELECT COUNT(*) as n FROM constraints').get() as { n: number }).n;
        const antiPatternCount = (db.prepare('SELECT COUNT(*) as n FROM anti_patterns').get() as { n: number }).n;

        const dbTrackingNote = isGitRepo(cwd)
          ? `\n  Note: .sigil/sigil.db is NOT gitignored by default.\n  Solo dev: commit it to persist state across machines.\n  Team: add .sigil/sigil.db to .gitignore and use \`sigil export context\` to share context.\n`
          : '';

        console.log(`
Sigil initialized successfully.

  Project:     ${projectName} (${projectType})
  Database:    .sigil/sigil.db
  Rules:       ${ruleCount} architecture rules seeded
  Constraints: ${constraintCount} constraints seeded
  Anti-patterns: ${antiPatternCount} anti-patterns seeded

  Context files generated:
    → CLAUDE.md
    → AGENTS.md
    → .sigil/exports/context-latest.md
${dbTrackingNote}
Run \`sigil status\` to see your project dashboard.
Run \`sigil ingest\` after coding sessions to update context.
`);
      } catch (err) {
        rl.close();
        console.error('Init failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
