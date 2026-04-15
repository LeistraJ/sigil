import fs from 'fs';
import { Database as WasmDatabase, Statement as WasmStatement } from 'node-sqlite3-wasm';

// Thin shim: provides the better-sqlite3 API surface (spread args, unknown returns)
// on top of node-sqlite3-wasm so no call site needs to change.

class Statement {
  private _stmt: WasmStatement;

  constructor(stmt: WasmStatement) {
    this._stmt = stmt;
  }

  run(...args: unknown[]): void {
    this._stmt.run(args.length === 0 ? undefined : (args as never));
  }

  get(...args: unknown[]): unknown {
    const result = this._stmt.get(args.length === 0 ? undefined : (args as never));
    return result === null ? undefined : result;
  }

  all(...args: unknown[]): unknown[] {
    return this._stmt.all(args.length === 0 ? undefined : (args as never)) as unknown[];
  }
}

class Database {
  private _db: WasmDatabase;

  constructor(path: string) {
    this._db = new WasmDatabase(path);
  }

  exec(sql: string): void {
    this._db.exec(sql);
  }

  prepare(sql: string): Statement {
    return new Statement(this._db.prepare(sql));
  }

  close(): void {
    this._db.close();
  }
}

export type DB = Database;

let _db: DB | null = null;
let _dbPath: string | null = null;

// node-sqlite3-wasm's custom VFS creates a <file>.lock directory for advisory
// locking but never removes it on close — a known VFS quirk. We clean it up
// manually before open and after close so subsequent invocations aren't blocked.
function removeLockDir(dbPath: string): void {
  const lockDir = dbPath + '.lock';
  try {
    if (fs.existsSync(lockDir)) fs.rmdirSync(lockDir);
  } catch {
    // ignore — lock dir may already be gone or in use
  }
}

export function initDb(dbPath: string): DB {
  removeLockDir(dbPath); // clear any stale lock from a previous run
  const db = new Database(dbPath);
  db.exec('PRAGMA foreign_keys=ON');
  _db = db;
  _dbPath = dbPath;
  process.once('exit', closeDb);
  process.once('SIGINT', () => { closeDb(); process.exit(130); });
  process.once('SIGTERM', () => { closeDb(); process.exit(143); });
  return _db;
}

export function getDb(): DB {
  if (!_db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    if (_dbPath) {
      removeLockDir(_dbPath);
      _dbPath = null;
    }
  }
}
