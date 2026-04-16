import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface GitDiff {
  added: string[];
  modified: string[];
  deleted: string[];
}

export function getGitRoot(cwd?: string): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd: cwd ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
  } catch {
    return null;
  }
}

export function isGitRepo(cwd?: string): boolean {
  const dir = cwd ?? process.cwd();
  return fs.existsSync(path.join(dir, '.git'));
}

export function getHeadRef(cwd?: string): string | null {
  try {
    const result = execSync('git rev-parse HEAD', {
      cwd: cwd ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.toString().trim();
  } catch {
    return null;
  }
}

export function getDiffSinceRef(ref: string, cwd?: string): GitDiff {
  const dir = cwd ?? process.cwd();
  const result: GitDiff = { added: [], modified: [], deleted: [] };

  try {
    const output = execSync(`git diff --name-status ${ref}`, {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();

    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      const [status, ...fileParts] = line.split('\t');
      const file = fileParts.join('\t').trim();
      if (!file) continue;

      if (status.startsWith('A')) result.added.push(file);
      else if (status.startsWith('M')) result.modified.push(file);
      else if (status.startsWith('D')) result.deleted.push(file);
      else if (status.startsWith('R')) {
        // Renamed: R100\told-file\tnew-file
        const parts = line.split('\t');
        if (parts.length >= 3) {
          result.deleted.push(parts[1]);
          result.added.push(parts[2]);
        }
      }
    }
  } catch {
    // ref may not exist yet or git error — return empty diff
  }

  return result;
}

export function getChangedFilesMtime(since: string, cwd?: string): string[] {
  const dir = cwd ?? process.cwd();
  const sinceMs = new Date(since).getTime();
  if (isNaN(sinceMs)) return [];

  const results: string[] = [];

  function walk(dirPath: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const rel = path.relative(dir, fullPath);

      // Skip hidden dirs and node_modules, .sigil
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs > sinceMs) {
            results.push(rel);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  walk(dir);
  return results;
}

export function getUntrackedFiles(cwd?: string): string[] {
  try {
    const output = execSync('git ls-files --others --exclude-standard', {
      cwd: cwd ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();

    return output.split('\n').filter(l => l.trim().length > 0);
  } catch {
    return [];
  }
}

export function getCurrentBranch(cwd?: string): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: cwd ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
  } catch {
    return null;
  }
}

export function getShortRef(cwd?: string): string | null {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: cwd ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
  } catch {
    return null;
  }
}

export function getRecentCommits(n = 5, cwd?: string): string[] {
  try {
    return execSync(`git log --oneline -${n}`, {
      cwd: cwd ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim().split('\n').filter(l => l.trim().length > 0);
  } catch {
    return [];
  }
}

export function getDirtyFiles(cwd?: string): string[] {
  try {
    return execSync('git status --porcelain', {
      cwd: cwd ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim().split('\n')
      .filter(l => l.trim().length > 0)
      .map(l => l.slice(3).trim());
  } catch {
    return [];
  }
}
