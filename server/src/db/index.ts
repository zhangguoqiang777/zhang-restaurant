import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { runMigrations } from './migrations';

export type DB = Database.Database;

let instance: DB | null = null;

/** 打开数据库并执行连接级 PRAGMA；WAL 需要与单进程写入配合 */
export function openDatabase(file: string = config.dbFile): DB {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  runMigrations(db);
  return db;
}

export function getDb(): DB {
  if (!instance) instance = openDatabase();
  return instance;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
