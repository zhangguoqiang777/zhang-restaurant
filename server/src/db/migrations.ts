import type { Database } from 'better-sqlite3';
import { nowIso } from '../lib/time';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * 编号迁移：只追加，不修改已发布的历史迁移。
 * 第 1 版与 docs/架构与数据模型.md 第 4 节 DDL 一致（10 张业务表 + 索引）。
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'init_schema',
    sql: `
-- 1. 登录用户与权限
CREATE TABLE app_user (
  id                  INTEGER PRIMARY KEY,
  openid              TEXT    NOT NULL,
  nickname            TEXT,
  is_super            INTEGER NOT NULL DEFAULT 0 CHECK (is_super IN (0, 1)),
  can_merchant        INTEGER NOT NULL DEFAULT 0 CHECK (can_merchant IN (0, 1)),
  merchant_granted_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
  merchant_granted_at TEXT,
  last_role           TEXT    NOT NULL DEFAULT 'customer'
                              CHECK (last_role IN ('customer', 'merchant', 'admin')),
  locale              TEXT    NOT NULL DEFAULT 'zh-CN'
                              CHECK (locale IN ('zh-CN', 'en-US')),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (openid)
);

-- 2. 菜品分类
CREATE TABLE dish_category (
  id          INTEGER PRIMARY KEY,
  name_zh     TEXT    NOT NULL,
  name_en     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 3. 菜品（无价格、无成本）
CREATE TABLE dish (
  id           INTEGER PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES dish_category(id) ON DELETE RESTRICT,
  name_zh      TEXT    NOT NULL,
  name_en      TEXT,
  intro_zh     TEXT,
  intro_en     TEXT,
  image_key    TEXT,
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 4. 食材库（无单位、无库存）
CREATE TABLE ingredient (
  id          INTEGER PRIMARY KEY,
  name_zh     TEXT    NOT NULL,
  name_en     TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 5. 菜品食材清单：只有对应关系，无用量/单位
CREATE TABLE dish_ingredient (
  dish_id       INTEGER NOT NULL REFERENCES dish(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredient(id) ON DELETE CASCADE,
  PRIMARY KEY (dish_id, ingredient_id)
);

-- 6. 订单：三状态 + 软删除取消
CREATE TABLE orders (
  id                  INTEGER PRIMARY KEY,
  customer_id         INTEGER NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  status              TEXT    NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'cooking', 'completed')),
  remark              TEXT,
  business_date       TEXT    NOT NULL,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  cooking_at          TEXT,
  completed_at        TEXT,
  deleted_at          TEXT,
  deleted_by_user_id  INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (deleted_by_user_id IS NULL OR deleted_at IS NOT NULL)
);

-- 7. 订单明细：菜名快照，无价格
CREATE TABLE order_item (
  id       INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  dish_id  INTEGER NOT NULL REFERENCES dish(id) ON DELETE RESTRICT,
  name_zh  TEXT    NOT NULL,
  name_en  TEXT,
  qty      INTEGER NOT NULL CHECK (qty > 0)
);

-- 8. 订单食材快照：每单每食材一行，用于采购详情
CREATE TABLE order_ingredient (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredient(id) ON DELETE RESTRICT,
  name_zh       TEXT    NOT NULL,
  name_en       TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (order_id, ingredient_id)
);

-- 9. 整单评价：一单一评
CREATE TABLE review (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content     TEXT,
  is_hidden   INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 10. 菜品评分与短评
CREATE TABLE review_item (
  id         INTEGER PRIMARY KEY,
  review_id  INTEGER NOT NULL REFERENCES review(id) ON DELETE CASCADE,
  dish_id    INTEGER NOT NULL REFERENCES dish(id) ON DELETE RESTRICT,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content    TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (review_id, dish_id)
);

-- 索引
CREATE INDEX idx_dish_category_active_sort ON dish_category (is_active, sort_order);
CREATE INDEX idx_dish_category_sort        ON dish (category_id, sort_order);
CREATE INDEX idx_ingredient_active         ON ingredient (is_active);
CREATE INDEX idx_dish_ingredient_ingredient ON dish_ingredient (ingredient_id);
CREATE INDEX idx_orders_customer_created   ON orders (customer_id, created_at DESC);
CREATE INDEX idx_orders_business_status    ON orders (business_date, status);
CREATE INDEX idx_orders_status_created     ON orders (status, created_at DESC);
CREATE INDEX idx_order_item_order          ON order_item (order_id);
CREATE INDEX idx_order_item_dish           ON order_item (dish_id);
CREATE INDEX idx_order_ingredient_ingredient ON order_ingredient (ingredient_id);
CREATE INDEX idx_review_customer_created   ON review (customer_id, created_at DESC);
CREATE INDEX idx_review_item_dish          ON review_item (dish_id);
`,
  },
];

export function runMigrations(db: Database): { applied: number[]; skipped: number[] } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migration').all() as { version: number }[];
  const applied = new Set(appliedRows.map((r) => r.version));
  const inserted: number[] = [];
  const skipped: number[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      skipped.push(migration.version);
      continue;
    }
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migration (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        nowIso(),
      );
    })();
    inserted.push(migration.version);
  }

  return { applied: inserted, skipped };
}
