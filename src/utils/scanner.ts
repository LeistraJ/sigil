import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface CommentHit {
  type: 'TODO' | 'HACK' | 'FIXME' | 'WORKAROUND';
  line: number;
  text: string;
  file: string;
}

const COMMENT_PATTERN = /(?:\/\/|\/\*|#)\s*(TODO|HACK|FIXME|WORKAROUND)\b[:\s]*(.*)/i;

export function scanForComments(filePath: string): CommentHit[] {
  const hits: CommentHit[] = [];

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return hits;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(COMMENT_PATTERN);
    if (match) {
      const type = match[1].toUpperCase() as CommentHit['type'];
      hits.push({
        type,
        line: i + 1,
        text: match[2]?.trim() ?? '',
        file: filePath,
      });
    }
  }

  return hits;
}

export function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

const DEFAULT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.cs', '.cpp', '.c',
  '.vue', '.svelte', '.html', '.css', '.scss', '.sass',
  '.sh', '.bash',
]);

// Fallback skip list for non-git projects
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.sigil',
  '.next', '.nuxt', 'coverage', '.cache', 'vendor', 'vendors',
  'opensrc', 'third_party', 'thirdparty', 'extern', 'external',
  '__pycache__', '.tox', 'venv', '.venv', 'env',
  'target', 'bin', 'obj', 'pkg',
  '.expo', '.svelte-kit', '.output', '.vercel', '.netlify',
  'public', 'static', 'assets', '.turbo', 'storybook-static',
]);

// Use git ls-files when available — respects .gitignore automatically
// and only returns files the developer actually owns.
function scanWithGit(dir: string): string[] {
  try {
    const output = execSync('git ls-files --cached --others --exclude-standard', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .filter(f => f && DEFAULT_EXTENSIONS.has(path.extname(f)))
      .map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

function scanWithWalk(dir: string): string[] {
  const results: string[] = [];

  function walk(dirPath: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && DEFAULT_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

export function scanDirectory(dir: string): string[] {
  const gitFiles = scanWithGit(dir);
  return gitFiles.length > 0 ? gitFiles : scanWithWalk(dir);
}

export function isSourceFile(filePath: string): boolean {
  return DEFAULT_EXTENSIONS.has(path.extname(filePath));
}
