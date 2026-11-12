import type { DB } from '../db';

export type OrderStatus = 'pending' | 'cooking' | 'completed';

export interface OrderRow {
  id: number;
  customer_id: number;
  status: OrderStatus;
  remark: string | null;
  business_date: string;
  created_at: string;
  cooking_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
  deleted_by_user_id: number | null;
  updated_at: string;
}

export interface OrderItemRow {
  id: number;
  order_id: number;
  dish_id: number;
  name_zh: string;
  qty: number;
}

export interface OrderIngredientRow {
  ingredient_id: number;
  name_zh: string;
}

export interface ReviewRow {
  id: number;
  order_id: number;
  customer_id: number;
  rating: number;
  content: string | null;
  is_hidden: number;
  created_at: string;
}

export interface ReviewItemRow {
  id: number;
  review_id: number;
  dish_id: number;
  rating: number;
  content: string | null;
  created_at: string;
}

export function getOrderRow(db: DB, id: number): OrderRow | undefined {
  return db.prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL').get(id) as OrderRow | undefined;
}

export function getOrderItems(db: DB, orderIds: number[]): Map<number, OrderItemRow[]> {
  const map = new Map<number, OrderItemRow[]>();
  if (orderIds.length === 0) return map;
  const placeholders = orderIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM order_item WHERE order_id IN (${placeholders}) ORDER BY id ASC`)
    .all(...orderIds) as OrderItemRow[];
  for (const row of rows) {
    const list = map.get(row.order_id) ?? [];
    list.push(row);
    map.set(row.order_id, list);
  }
  return map;
}

export function getOrderIngredients(db: DB, orderId: number): OrderIngredientRow[] {
  return db
    .prepare(
      `SELECT ingredient_id, name_zh
         FROM order_ingredient
        WHERE order_id = ?
        ORDER BY id ASC`,
    )
    .all(orderId) as OrderIngredientRow[];
}

export function getReviewsByOrderIds(db: DB, orderIds: number[]): Map<number, ReviewRow> {
  const map = new Map<number, ReviewRow>();
  if (orderIds.length === 0) return map;
  const placeholders = orderIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM review WHERE order_id IN (${placeholders})`)
    .all(...orderIds) as ReviewRow[];
  for (const row of rows) map.set(row.order_id, row);
  return map;
}

export function serializeOrder(
  order: OrderRow,
  items: OrderItemRow[],
  ingredients: OrderIngredientRow[],
  review: ReviewRow | null,
  extra: Record<string, unknown> = {},
) {
  const timeline: { key: 'created' | 'cooking' | 'completed'; at: string }[] = [
    { key: 'created', at: order.created_at },
  ];
  if (order.cooking_at) timeline.push({ key: 'cooking', at: order.cooking_at });
  if (order.completed_at) timeline.push({ key: 'completed', at: order.completed_at });

  return {
    id: order.id,
    status: order.status,
    remark: order.remark,
    businessDate: order.business_date,
    createdAt: order.created_at,
    cookingAt: order.cooking_at,
    completedAt: order.completed_at,
    items: items.map((i) => ({ dishId: i.dish_id, nameZh: i.name_zh, qty: i.qty })),
    ingredients: ingredients.map((i) => ({ ingredientId: i.ingredient_id, nameZh: i.name_zh })),
    timeline,
    review: review
      ? {
          id: review.id,
          rating: review.rating,
          content: review.content,
          isHidden: review.is_hidden === 1,
          createdAt: review.created_at,
        }
      : null,
    reviewed: !!review,
    canCancel: order.status === 'pending',
    canReview: order.status === 'completed' && !review,
    ...extra,
  };
}

export function serializeReviewItems(rows: (ReviewItemRow & { name_zh?: string })[]) {
  return rows.map((r) => ({
    dishId: r.dish_id,
    nameZh: r.name_zh ?? null,
    rating: r.rating,
    content: r.content,
    createdAt: r.created_at,
  }));
}
