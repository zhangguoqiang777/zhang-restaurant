import type { FastifyInstance, FastifyRequest } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { AppError, errors } from '../lib/errors';
import { ok, paged, parsePage } from '../lib/response';
import { boolOf, toImageUrl } from '../lib/urls';
import { nowIso } from '../lib/time';

interface CategoryBody {
  nameZh: string;
  sortOrder?: number;
  isActive?: boolean;
}

interface DishBody {
  categoryId?: number;
  nameZh?: string;
  introZh?: string | null;
  imageKey?: string | null;
  isAvailable?: boolean;
  sortOrder?: number;
  ingredientIds?: number[];
}

interface MerchantDishRow {
  id: number;
  category_id: number;
  category_name: string;
  name_zh: string;
  intro_zh: string | null;
  image_key: string | null;
  is_available: number;
  sort_order: number;
  rating_avg: number | null;
  rating_count: number;
  created_at: string;
  updated_at: string;
}

const MERCHANT_DISH_SELECT = `
  SELECT d.id, d.category_id, c.name_zh AS category_name, d.name_zh, d.intro_zh,
         d.image_key, d.is_available, d.sort_order, d.created_at, d.updated_at,
         (SELECT ROUND(AVG(ri.rating), 1) FROM review_item ri
            JOIN review r ON r.id = ri.review_id
           WHERE ri.dish_id = d.id AND r.is_hidden = 0) AS rating_avg,
         (SELECT COUNT(*) FROM review_item ri
            JOIN review r ON r.id = ri.review_id
           WHERE ri.dish_id = d.id AND r.is_hidden = 0) AS rating_count
    FROM dish d
    JOIN dish_category c ON c.id = d.category_id
`;

const paramsIdSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

export default async function merchantCatalogRoutes(app: FastifyInstance): Promise<void> {
  const merchantOnly = { preHandler: [app.authenticate, app.requireMerchant] };

  /* ---------------- 分类 ---------------- */

  app.get('/merchant/categories', merchantOnly, async (request, reply) => {
    const rows = app.db
      .prepare(
        `SELECT c.id, c.name_zh, c.sort_order, c.is_active,
                (SELECT COUNT(*) FROM dish d WHERE d.category_id = c.id) AS dish_count
           FROM dish_category c
          ORDER BY c.sort_order ASC, c.id ASC`,
      )
      .all() as { id: number; name_zh: string; sort_order: number; is_active: number; dish_count: number }[];

    return ok(
      reply,
      rows.map((r) => ({
        id: r.id,
        nameZh: r.name_zh,
        sortOrder: r.sort_order,
        isActive: boolOf(r.is_active),
        dishCount: r.dish_count,
      })),
    );
  });

  app.post<{ Body: CategoryBody }>(
    '/merchant/categories',
    {
      ...merchantOnly,
      schema: {
        body: {
          type: 'object',
          required: ['nameZh'],
          additionalProperties: false,
          properties: {
            nameZh: { type: 'string', minLength: 1, maxLength: 20 },
            sortOrder: { type: 'integer' },
            isActive: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const nameZh = request.body.nameZh.trim();
      const duplicate = app.db.prepare('SELECT id FROM dish_category WHERE name_zh = ?').get(nameZh);
      if (duplicate) throw errors.validation('分类名称已存在', { nameZh });

      const info = app.db
        .prepare('INSERT INTO dish_category (name_zh, sort_order, is_active) VALUES (?, ?, ?)')
        .run(nameZh, request.body.sortOrder ?? 0, request.body.isActive === false ? 0 : 1);

      return ok(reply, getCategoryPayload(app, Number(info.lastInsertRowid)), 201);
    },
  );

  app.patch<{ Params: { id: number }; Body: Partial<CategoryBody> }>(
    '/merchant/categories/:id',
    {
      ...merchantOnly,
      schema: {
        params: paramsIdSchema,
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            nameZh: { type: 'string', minLength: 1, maxLength: 20 },
            sortOrder: { type: 'integer' },
            isActive: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const existing = app.db.prepare('SELECT * FROM dish_category WHERE id = ?').get(request.params.id) as
        | { id: number; name_zh: string; sort_order: number; is_active: number }
        | undefined;
      if (!existing) throw new AppError('CATEGORY_NOT_FOUND', '分类不存在');

      const nameZh = request.body.nameZh?.trim() ?? existing.name_zh;
      if (nameZh !== existing.name_zh) {
        const duplicate = app.db
          .prepare('SELECT id FROM dish_category WHERE name_zh = ? AND id <> ?')
          .get(nameZh, existing.id);
        if (duplicate) throw errors.validation('分类名称已存在', { nameZh });
      }

      app.db
        .prepare('UPDATE dish_category SET name_zh = ?, sort_order = ?, is_active = ?, updated_at = ? WHERE id = ?')
        .run(
          nameZh,
          request.body.sortOrder ?? existing.sort_order,
          typeof request.body.isActive === 'boolean' ? (request.body.isActive ? 1 : 0) : existing.is_active,
          nowIso(),
          existing.id,
        );

      return ok(reply, getCategoryPayload(app, existing.id));
    },
  );

  /* ---------------- 菜品 ---------------- */

  app.get<{ Querystring: { categoryId?: number; keyword?: string } }>(
    '/merchant/dishes',
    {
      ...merchantOnly,
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            categoryId: { type: 'integer', minimum: 1 },
            keyword: { type: 'string', maxLength: 40 },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
          },
        },
      },
    },
    async (request, reply) => {
      const pageQuery = parsePage(request.query as Record<string, unknown>, 50);
      const where: string[] = ['1 = 1'];
      const params: unknown[] = [];

      if (request.query.categoryId) {
        where.push('d.category_id = ?');
        params.push(request.query.categoryId);
      }
      if (request.query.keyword?.trim()) {
        where.push('(d.name_zh LIKE ? ESCAPE \'\\\' OR IFNULL(d.intro_zh, \'\') LIKE ? ESCAPE \'\\\')');
        const pattern = `%${escapeLike(request.query.keyword.trim())}%`;
        params.push(pattern, pattern);
      }
      const whereSql = `WHERE ${where.join(' AND ')}`;

      const total = (
        app.db
          .prepare(
            `SELECT COUNT(*) AS n FROM dish d JOIN dish_category c ON c.id = d.category_id ${whereSql}`,
          )
          .get(...params) as { n: number }
      ).n;

      const rows = app.db
        .prepare(
          `${MERCHANT_DISH_SELECT} ${whereSql}
            ORDER BY c.sort_order ASC, d.sort_order ASC, d.id ASC
            LIMIT ? OFFSET ?`,
        )
        .all(...params, pageQuery.pageSize, pageQuery.offset) as MerchantDishRow[];

      const ingredientMap = getDishIngredients(app.db, rows.map((r) => r.id));

      return ok(
        reply,
        paged(
          rows.map((row) => toMerchantDish(request, row, ingredientMap.get(row.id) ?? [])),
          total,
          pageQuery,
        ),
      );
    },
  );

  app.post<{ Body: DishBody }>(
    '/merchant/dishes',
    {
      ...merchantOnly,
      schema: {
        body: {
          type: 'object',
          required: ['categoryId', 'nameZh'],
          additionalProperties: false,
          properties: {
            categoryId: { type: 'integer', minimum: 1 },
            nameZh: { type: 'string', minLength: 1, maxLength: 60 },
            introZh: { type: ['string', 'null'], maxLength: 200 },
            imageKey: { type: ['string', 'null'], maxLength: 255 },
            isAvailable: { type: 'boolean' },
            sortOrder: { type: 'integer' },
            ingredientIds: {
              type: 'array',
              maxItems: 50,
              items: { type: 'integer', minimum: 1 },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      assertCategory(app.db, body.categoryId!);
      const ingredientIds = uniqueIds(body.ingredientIds);
      assertIngredients(app.db, ingredientIds);

      const now = nowIso();
      const create = app.db.transaction(() => {
        const info = app.db
          .prepare(
            `INSERT INTO dish (category_id, name_zh, intro_zh, image_key, is_available, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            body.categoryId!,
            body.nameZh!.trim(),
            body.introZh?.trim() || null,
            body.imageKey?.trim() || null,
            body.isAvailable === false ? 0 : 1,
            body.sortOrder ?? 0,
            now,
            now,
          );
        const dishId = Number(info.lastInsertRowid);
        replaceDishIngredients(app.db, dishId, ingredientIds);
        return dishId;
      });

      const dishId = create();
      return ok(reply, getMerchantDishDetail(app, request, dishId), 201);
    },
  );

  app.patch<{ Params: { id: number }; Body: DishBody }>(
    '/merchant/dishes/:id',
    {
      ...merchantOnly,
      schema: {
        params: paramsIdSchema,
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            categoryId: { type: 'integer', minimum: 1 },
            nameZh: { type: 'string', minLength: 1, maxLength: 60 },
            introZh: { type: ['string', 'null'], maxLength: 200 },
            imageKey: { type: ['string', 'null'], maxLength: 255 },
            isAvailable: { type: 'boolean' },
            sortOrder: { type: 'integer' },
            ingredientIds: {
              type: 'array',
              maxItems: 50,
              items: { type: 'integer', minimum: 1 },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const existing = app.db.prepare('SELECT * FROM dish WHERE id = ?').get(request.params.id) as
        | {
            id: number;
            category_id: number;
            name_zh: string;
            intro_zh: string | null;
            image_key: string | null;
            is_available: number;
            sort_order: number;
          }
        | undefined;
      if (!existing) throw new AppError('DISH_NOT_FOUND', '菜品不存在');

      const body = request.body;
      if (body.categoryId !== undefined) assertCategory(app.db, body.categoryId);
      const ingredientIds = body.ingredientIds === undefined ? undefined : uniqueIds(body.ingredientIds);
      if (ingredientIds) assertIngredients(app.db, ingredientIds);

      const now = nowIso();
      const update = app.db.transaction(() => {
        app.db
          .prepare(
            `UPDATE dish
                SET category_id = ?, name_zh = ?, intro_zh = ?, image_key = ?,
                    is_available = ?, sort_order = ?, updated_at = ?
              WHERE id = ?`,
          )
          .run(
            body.categoryId ?? existing.category_id,
            body.nameZh?.trim() ?? existing.name_zh,
            body.introZh === undefined ? existing.intro_zh : body.introZh?.trim() || null,
            body.imageKey === undefined ? existing.image_key : body.imageKey?.trim() || null,
            typeof body.isAvailable === 'boolean' ? (body.isAvailable ? 1 : 0) : existing.is_available,
            body.sortOrder ?? existing.sort_order,
            now,
            existing.id,
          );

        if (ingredientIds) replaceDishIngredients(app.db, existing.id, ingredientIds);
      });
      update();

      return ok(reply, getMerchantDishDetail(app, request, existing.id));
    },
  );

  /* ---------------- 食材 ---------------- */

  app.get<{ Querystring: { keyword?: string; includeInactive?: string } }>(
    '/merchant/ingredients',
    {
      ...merchantOnly,
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            keyword: { type: 'string', maxLength: 40 },
            includeInactive: { type: 'string', enum: ['0', '1', 'true', 'false'] },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
          },
        },
      },
    },
    async (request, reply) => {
      const pageQuery = parsePage(request.query as Record<string, unknown>, 100);
      const where: string[] = [];
      const params: unknown[] = [];

      if (request.query.includeInactive !== '1' && request.query.includeInactive !== 'true') {
        where.push('i.is_active = 1');
      }
      if (request.query.keyword?.trim()) {
        where.push("i.name_zh LIKE ? ESCAPE '\\'");
        params.push(`%${escapeLike(request.query.keyword.trim())}%`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const total = (
        app.db.prepare(`SELECT COUNT(*) AS n FROM ingredient i ${whereSql}`).get(...params) as { n: number }
      ).n;

      const rows = app.db
        .prepare(
          `SELECT i.id, i.name_zh, i.is_active,
                  (SELECT COUNT(*) FROM dish_ingredient di WHERE di.ingredient_id = i.id) AS dish_count
             FROM ingredient i
             ${whereSql}
            ORDER BY i.id ASC
            LIMIT ? OFFSET ?`,
        )
        .all(...params, pageQuery.pageSize, pageQuery.offset) as {
        id: number;
        name_zh: string;
        is_active: number;
        dish_count: number;
      }[];

      return ok(
        reply,
        paged(
          rows.map((r) => ({
            id: r.id,
            nameZh: r.name_zh,
            isActive: boolOf(r.is_active),
            dishCount: r.dish_count,
          })),
          total,
          pageQuery,
        ),
      );
    },
  );

  app.post<{ Body: { nameZh: string } }>(
    '/merchant/ingredients',
    {
      ...merchantOnly,
      schema: {
        body: {
          type: 'object',
          required: ['nameZh'],
          additionalProperties: false,
          properties: { nameZh: { type: 'string', minLength: 1, maxLength: 20 } },
        },
      },
    },
    async (request, reply) => {
      const nameZh = request.body.nameZh.trim();
      const duplicate = app.db.prepare('SELECT id FROM ingredient WHERE name_zh = ?').get(nameZh) as
        | { id: number }
        | undefined;
      if (duplicate) throw errors.validation('食材已存在', { id: duplicate.id, nameZh });

      const info = app.db.prepare('INSERT INTO ingredient (name_zh, is_active) VALUES (?, 1)').run(nameZh);
      return ok(reply, { id: Number(info.lastInsertRowid), nameZh, isActive: true }, 201);
    },
  );

  app.patch<{ Params: { id: number }; Body: { nameZh?: string; isActive?: boolean } }>(
    '/merchant/ingredients/:id',
    {
      ...merchantOnly,
      schema: {
        params: paramsIdSchema,
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            nameZh: { type: 'string', minLength: 1, maxLength: 20 },
            isActive: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const existing = app.db.prepare('SELECT * FROM ingredient WHERE id = ?').get(request.params.id) as
        | { id: number; name_zh: string; is_active: number }
        | undefined;
      if (!existing) throw new AppError('INGREDIENT_NOT_FOUND', '食材不存在');

      const nameZh = request.body.nameZh?.trim() ?? existing.name_zh;
      if (nameZh !== existing.name_zh) {
        const duplicate = app.db
          .prepare('SELECT id FROM ingredient WHERE name_zh = ? AND id <> ?')
          .get(nameZh, existing.id) as { id: number } | undefined;
        if (duplicate) throw errors.validation('食材已存在', { id: duplicate.id, nameZh });
      }

      app.db
        .prepare('UPDATE ingredient SET name_zh = ?, is_active = ?, updated_at = ? WHERE id = ?')
        .run(
          nameZh,
          typeof request.body.isActive === 'boolean' ? (request.body.isActive ? 1 : 0) : existing.is_active,
          nowIso(),
          existing.id,
        );

      const updated = app.db.prepare('SELECT * FROM ingredient WHERE id = ?').get(existing.id) as {
        id: number;
        name_zh: string;
        is_active: number;
      };
      return ok(reply, { id: updated.id, nameZh: updated.name_zh, isActive: boolOf(updated.is_active) });
    },
  );

  /* ---------------- 图片上传 ---------------- */

  app.post('/merchant/uploads/image', merchantOnly, async (request, reply) => {
    let file;
    try {
      file = await request.file();
    } catch {
      throw new AppError('UPLOAD_INVALID', '请使用 multipart/form-data 上传图片');
    }
    if (!file) throw new AppError('UPLOAD_INVALID', '缺少图片文件（字段名 file）');

    const ext = config.upload.mimeExt[file.mimetype];
    if (!ext) throw new AppError('UPLOAD_INVALID', '仅支持 jpg / png / webp / gif');

    const buffer = await file.toBuffer();
    if (buffer.length === 0) throw new AppError('UPLOAD_INVALID', '图片内容为空');

    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const imageKey = `${year}/${month}/${randomUUID()}.${ext}`;
    const target = path.join(config.uploadDir, imageKey);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);

    return ok(reply, { imageKey, url: toImageUrl(request, imageKey), size: buffer.length }, 201);
  });

  /* ---------------- 评价隐藏 ---------------- */

  app.patch<{ Params: { id: number }; Body: { hidden: boolean } }>(
    '/merchant/reviews/:id',
    {
      ...merchantOnly,
      schema: {
        params: paramsIdSchema,
        body: {
          type: 'object',
          required: ['hidden'],
          additionalProperties: false,
          properties: { hidden: { type: 'boolean' } },
        },
      },
    },
    async (request, reply) => {
      const existing = app.db.prepare('SELECT id FROM review WHERE id = ?').get(request.params.id);
      if (!existing) throw new AppError('REVIEW_NOT_FOUND', '评价不存在');

      app.db
        .prepare('UPDATE review SET is_hidden = ? WHERE id = ?')
        .run(request.body.hidden ? 1 : 0, request.params.id);

      return ok(reply, { id: request.params.id, hidden: request.body.hidden });
    },
  );
}

/* ---------------- 内部工具 ---------------- */

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function uniqueIds(ids: number[] | undefined): number[] {
  return [...new Set(ids ?? [])];
}

function assertCategory(db: FastifyInstance['db'], categoryId: number): void {
  const found = db.prepare('SELECT id FROM dish_category WHERE id = ?').get(categoryId);
  if (!found) throw new AppError('CATEGORY_NOT_FOUND', '分类不存在');
}

function assertIngredients(db: FastifyInstance['db'], ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  const found = db
    .prepare(`SELECT id FROM ingredient WHERE id IN (${placeholders})`)
    .all(...ids) as { id: number }[];
  const foundSet = new Set(found.map((r) => r.id));
  const missing = ids.filter((id) => !foundSet.has(id));
  if (missing.length) throw new AppError('INGREDIENT_NOT_FOUND', '部分食材不存在', { ingredientIds: missing });
}

function replaceDishIngredients(db: FastifyInstance['db'], dishId: number, ingredientIds: number[]): void {
  db.prepare('DELETE FROM dish_ingredient WHERE dish_id = ?').run(dishId);
  const insert = db.prepare('INSERT OR IGNORE INTO dish_ingredient (dish_id, ingredient_id) VALUES (?, ?)');
  for (const ingredientId of ingredientIds) insert.run(dishId, ingredientId);
}

function getDishIngredients(
  db: FastifyInstance['db'],
  dishIds: number[],
): Map<number, { id: number; nameZh: string }[]> {
  const map = new Map<number, { id: number; nameZh: string }[]>();
  if (dishIds.length === 0) return map;
  const placeholders = dishIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT di.dish_id, i.id, i.name_zh
         FROM dish_ingredient di
         JOIN ingredient i ON i.id = di.ingredient_id
        WHERE di.dish_id IN (${placeholders})
        ORDER BY i.id ASC`,
    )
    .all(...dishIds) as { dish_id: number; id: number; name_zh: string }[];

  for (const row of rows) {
    const list = map.get(row.dish_id) ?? [];
    list.push({ id: row.id, nameZh: row.name_zh });
    map.set(row.dish_id, list);
  }
  return map;
}

function toMerchantDish(
  request: FastifyRequest,
  row: MerchantDishRow,
  ingredients: { id: number; nameZh: string }[],
) {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    nameZh: row.name_zh,
    introZh: row.intro_zh,
    imageKey: row.image_key,
    imageUrl: toImageUrl(request, row.image_key),
    isAvailable: boolOf(row.is_available),
    sortOrder: row.sort_order,
    rating: { avg: row.rating_avg ?? null, count: row.rating_count },
    ingredients,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getCategoryPayload(app: FastifyInstance, categoryId: number) {
  const row = app.db
    .prepare(
      `SELECT c.id, c.name_zh, c.sort_order, c.is_active,
              (SELECT COUNT(*) FROM dish d WHERE d.category_id = c.id) AS dish_count
         FROM dish_category c
        WHERE c.id = ?`,
    )
    .get(categoryId) as
    | { id: number; name_zh: string; sort_order: number; is_active: number; dish_count: number }
    | undefined;
  if (!row) throw new AppError('CATEGORY_NOT_FOUND', '分类不存在');
  return {
    id: row.id,
    nameZh: row.name_zh,
    sortOrder: row.sort_order,
    isActive: boolOf(row.is_active),
    dishCount: row.dish_count,
  };
}

function getMerchantDishDetail(
  app: FastifyInstance,
  request: FastifyRequest,
  dishId: number,
) {
  const row = app.db.prepare(`${MERCHANT_DISH_SELECT} WHERE d.id = ?`).get(dishId) as
    | MerchantDishRow
    | undefined;
  if (!row) throw new AppError('DISH_NOT_FOUND', '菜品不存在');
  return toMerchantDish(request, row, getDishIngredients(app.db, [dishId]).get(dishId) ?? []);
}
