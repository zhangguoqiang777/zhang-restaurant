import type { FastifyInstance } from 'fastify';
import { errors } from '../lib/errors';
import { ok } from '../lib/response';
import { businessDateOf, isDateString, isRealDate } from '../lib/time';

export default async function purchaseRoutes(app: FastifyInstance): Promise<void> {
  // 采购清单：按食材聚合去重，返回涉及订单数（不返回数量/单位）
  app.get<{ Querystring: { date?: string } }>(
    '/merchant/purchases',
    {
      preHandler: [app.authenticate, app.requireMerchant],
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { date: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const date = request.query.date ?? businessDateOf();
      if (!isDateString(date) || !isRealDate(date)) throw errors.validation('date 格式应为 YYYY-MM-DD');

      const orderCount = (
        app.db
          .prepare('SELECT COUNT(*) AS n FROM orders WHERE business_date = ? AND deleted_at IS NULL')
          .get(date) as { n: number }
      ).n;

      const rows = app.db
        .prepare(
          `SELECT oi.ingredient_id,
                  MAX(oi.name_zh) AS name_zh,
                  COUNT(DISTINCT oi.order_id) AS order_count,
                  GROUP_CONCAT(DISTINCT oi.order_id) AS order_ids
             FROM order_ingredient oi
             JOIN orders o ON o.id = oi.order_id
            WHERE o.business_date = ? AND o.deleted_at IS NULL
            GROUP BY oi.ingredient_id
            ORDER BY order_count DESC, name_zh ASC`,
        )
        .all(date) as {
        ingredient_id: number;
        name_zh: string;
        order_count: number;
        order_ids: string | null;
      }[];

      // 该日订单里实际点了、且配方用到对应食材的菜名，用于「用于…」摘要
      const dishNameMap = new Map<number, string[]>();
      if (rows.length) {
        const dishRows = app.db
          .prepare(
            `SELECT DISTINCT di.ingredient_id, d.id, d.name_zh
               FROM order_item oi
               JOIN orders o ON o.id = oi.order_id
               JOIN dish_ingredient di ON di.dish_id = oi.dish_id
               JOIN dish d ON d.id = oi.dish_id
              WHERE o.business_date = ? AND o.deleted_at IS NULL
                AND di.ingredient_id IN (${rows.map(() => '?').join(',')})
              ORDER BY d.sort_order ASC, d.id ASC`,
          )
          .all(date, ...rows.map((row) => row.ingredient_id)) as {
          ingredient_id: number;
          id: number;
          name_zh: string;
        }[];
        for (const row of dishRows) {
          const list = dishNameMap.get(row.ingredient_id) ?? [];
          list.push(row.name_zh);
          dishNameMap.set(row.ingredient_id, list);
        }
      }

      return ok(reply, {
        date,
        orderCount,
        ingredientCount: rows.length,
        ingredients: rows.map((row) => ({
          ingredientId: row.ingredient_id,
          nameZh: row.name_zh,
          orderCount: row.order_count,
          orderIds: (row.order_ids ?? '')
            .split(',')
            .filter(Boolean)
            .map(Number)
            .sort((a, b) => a - b),
          dishNames: dishNameMap.get(row.ingredient_id) ?? [],
        })),
      });
    },
  );
}
