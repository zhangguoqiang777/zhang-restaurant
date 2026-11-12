import { closeDb, getDb } from '../db';
import { ensureUtf8Console } from '../lib/console-utf8';

ensureUtf8Console();

function main(): void {
  const db = getDb();
  const rows = db
    .prepare('SELECT version, name, applied_at FROM schema_migration ORDER BY version ASC')
    .all() as { version: number; name: string; applied_at: string }[];

  console.log(`迁移完成，共 ${rows.length} 个版本：`);
  for (const row of rows) {
    console.log(`  v${row.version} ${row.name}  applied_at=${row.applied_at}`);
  }

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  console.log(`数据表：${tables.map((t) => t.name).join(', ')}`);

  closeDb();
}

main();
