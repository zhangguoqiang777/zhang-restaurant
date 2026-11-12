import type { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';
import { ok, paged, parsePage } from '../lib/response';
import { boolOf, toImageUrl } from '../lib/urls';

interface DishRow {
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
}

const DISH_SELECT = `
  SELECT d.id, d.category_id, c.name_zh AS category_name, d.name_zh, d.intro_zh,
         d.image_key, d.is_available, d.sort_order,
         (SELECT ROUND(AVG(ri.rating), 1) FROM review_item ri
            JOIN review r ON r.id = ri.review_id
           WHERE ri.dish_id = d.id AND r.is_hidden = 0) AS rating_avg,
         (SELECT COUNT(*) FROM review_item ri
            JOIN review r ON r.id = ri.review_id
           WHERE ri.dish_id = d.id AND r.is_hidden = 0) AS rating_count
    FROM dish d
    JOIN dish_category c ON c.id = d.category_id
`;

export default async function catalogRoutes(app: FastifyInstance): Promise<void> {
  // 启用中的分类（客户菜单左侧）
  app.get('/categories', { preHandler: [app.authenticate] }, async (request, reply) => {
    const rows = app.db
      .prepare(
        `SELECT id, name_zh, sort_order
           FROM dish_category
          WHERE is_active = 1
          ORDER BY sort_order ASC, id ASC`,
      )
      .all() as { id: number; name_zh: string; sort_order: number }[];

    return ok(
      reply,
      rows.map((r) => ({ id: r.id, nameZh: r.name_zh, sortOrder: r.sort_order })),
    );
  });

  // 菜单：只返回启用分类下的在售菜品
  app.get<{ Querystring: { categoryId?: number } }>(
    '/dishes',
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { categoryId: { type: 'integer', minimum: 1 }, page: { type: 'integer' }, pageSize: { type: 'integer' } },
        },
      },
    },
    async (request, reply) => {
      const { categoryId } = request.query;
      const pageQuery = parsePage(request.query as Record<string, unknown>, 50);
      const where: string[] = ['d.is_available = 1', 'c.is_active = 1'];
      const params: unknown[] = [];

      if (categoryId) {
        where.push('d.category_id = ?');
        params.push(categoryId);
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
          `${DISH_SELECT} ${whereSql}
            ORDER BY c.sort_order ASC, d.sort_order ASC, d.id ASC
            LIMIT ? OFFSET ?`,
        )
        .all(...params, pageQuery.pageSize, pageQuery.offset) as DishRow[];

      return ok(
        reply,
        paged(
          rows.map((row) => toDishSummary(request, row)),
          total,
          pageQuery,
        ),
      );
    },
  );

  // 菜品详情：含食材与评分
  app.get<{ Params: { id: number } }>(
    '/dishes/:id',
    {
      preHandler: [app.authenticate],
      schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } },
    },
    async (request, reply) => {
      const row = app.db
        .prepare(`${DISH_SELECT} WHERE d.id = ? AND d.is_available = 1 AND c.is_active = 1`)
        .get(request.params.id) as DishRow | undefined;

      if (!row) throw new AppError('DISH_NOT_FOUND', '菜品不存在或已下架');

      const ingredients = app.db
        .prepare(
          `SELECT i.id, i.name_zh
             FROM dish_ingredient di
             JOIN ingredient i ON i.id = di.ingredient_id
            WHERE di.dish_id = ?
            ORDER BY i.id ASC`,
        )
        .all(row.id) as { id: number; name_zh: string }[];

      return ok(reply, {
        ...toDishSummary(request, row),
        ingredients: ingredients.map((i) => ({ id: i.id, nameZh: i.name_zh })),
      });
    },
  );

  // 菜品评价：只返回未隐藏的整单评价中的该菜评分
  app.get<{ Params: { id: number } }>(
    '/dishes/:id/reviews',
    {
      preHandler: [app.authenticate],
      schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } },
    },
    async (request, reply) => {
      const dishId = request.params.id;
      const dish = app.db.prepare('SELECT id FROM dish WHERE id = ?').get(dishId) as { id: number } | undefined;
      if (!dish) throw new AppError('DISH_NOT_FOUND', '菜品不存在');

      const pageQuery = parsePage(request.query as Record<string, unknown>, 20);

      const total = (
        app.db
          .prepare(
            `SELECT COUNT(*) AS n
               FROM review_item ri
               JOIN review r ON r.id = ri.review_id
              WHERE ri.dish_id = ? AND r.is_hidden = 0`,
          )
          .get(dishId) as { n: number }
      ).n;

      const rows = app.db
        .prepare(
          `SELECT ri.id, ri.rating, ri.content, ri.created_at, r.id AS review_id, u.nickname
             FROM review_item ri
             JOIN review r ON r.id = ri.review_id
             JOIN app_user u ON u.id = r.customer_id
            WHERE ri.dish_id = ? AND r.is_hidden = 0
            ORDER BY r.created_at DESC, ri.id DESC
            LIMIT ? OFFSET ?`,
        )
        .all(dishId, pageQuery.pageSize, pageQuery.offset) as {
        id: number;
        rating: number;
        content: string | null;
        created_at: string;
        review_id: number;
        nickname: string | null;
      }[];

      return ok(
        reply,
        paged(
          rows.map((r) => ({
            id: r.id,
            reviewId: r.review_id,
            rating: r.rating,
            content: r.content,
            nickname: r.nickname ?? '匿名食客',
            createdAt: r.created_at,
          })),
          total,
          pageQuery,
        ),
      );
    },
  );
}

function toDishSummary(
  request: Parameters<typeof toImageUrl>[0],
  row: DishRow,
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
  };
}
