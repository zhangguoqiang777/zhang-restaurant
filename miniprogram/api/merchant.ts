import type {
  Category,
  Dish,
  Ingredient,
  Order,
  OrderStatus,
  PurchaseSummary
} from '../types/models';
import {
  extractList,
  normalizeCategory,
  normalizeDish,
  normalizeIngredient,
  normalizeOrder,
  normalizePurchase
} from '../utils/normalize';
import { request, withQuery } from './request';

export function fetchMerchantOrders(date: string, status?: OrderStatus): Promise<Order[]> {
  const url = withQuery('/merchant/orders', { date, status, page: 1, pageSize: 50 });
  return request<any>({ url }).then((data) => extractList(data && data.orders ? data.orders : data).map(normalizeOrder));
}

export function fetchMerchantOrder(id: number): Promise<Order> {
  return request<any>({ url: `/merchant/orders/${id}` }).then(normalizeOrder);
}

export function startOrder(id: number): Promise<void> {
  return request<any>({ url: `/merchant/orders/${id}/start`, method: 'POST' }).then(() => undefined);
}

export function completeOrder(id: number): Promise<void> {
  return request<any>({ url: `/merchant/orders/${id}/complete`, method: 'POST' }).then(() => undefined);
}

export function cancelMerchantOrder(id: number): Promise<void> {
  return request<any>({ url: `/merchant/orders/${id}`, method: 'DELETE' }).then(() => undefined);
}

export function fetchPurchases(date: string): Promise<PurchaseSummary> {
  return request<any>({ url: withQuery('/merchant/purchases', { date }) }).then(normalizePurchase);
}

export function fetchMerchantCategories(): Promise<Category[]> {
  return request<any>({ url: '/merchant/categories' }).then((data) =>
    extractList(data && data.categories ? data.categories : data).map(normalizeCategory)
  );
}

export function createCategory(payload: { nameZh: string; sortOrder?: number }): Promise<Category> {
  return request<any>({ url: '/merchant/categories', method: 'POST', data: payload }).then(normalizeCategory);
}

export function updateCategory(
  id: number,
  payload: { nameZh?: string; sortOrder?: number; isActive?: boolean }
): Promise<void> {
  return request<any>({ url: `/merchant/categories/${id}`, method: 'PATCH', data: payload }).then(() => undefined);
}

export function fetchMerchantDishes(): Promise<Dish[]> {
  return request<any>({ url: '/merchant/dishes' }).then((data) =>
    extractList(data && data.dishes ? data.dishes : data).map(normalizeDish)
  );
}

export interface DishPayload {
  nameZh: string;
  categoryId: number;
  introZh?: string;
  imageKey?: string;
  isAvailable?: boolean;
  sortOrder?: number;
  ingredientIds: number[];
}

export function createDish(payload: DishPayload): Promise<Dish> {
  return request<any>({ url: '/merchant/dishes', method: 'POST', data: payload }).then(normalizeDish);
}

export function updateDish(id: number, payload: Partial<DishPayload>): Promise<void> {
  return request<any>({ url: `/merchant/dishes/${id}`, method: 'PATCH', data: payload }).then(() => undefined);
}

export function fetchMerchantIngredients(includeInactive = false): Promise<Ingredient[]> {
  const url = withQuery('/merchant/ingredients', { includeInactive: includeInactive ? '1' : undefined });
  return request<any>({ url }).then((data) =>
    extractList(data && data.ingredients ? data.ingredients : data).map(normalizeIngredient)
  );
}

export function createIngredient(payload: { nameZh: string }): Promise<Ingredient> {
  return request<any>({ url: '/merchant/ingredients', method: 'POST', data: payload }).then(normalizeIngredient);
}

export function updateIngredient(id: number, payload: { nameZh?: string; isActive?: boolean }): Promise<void> {
  return request<any>({ url: `/merchant/ingredients/${id}`, method: 'PATCH', data: payload }).then(() => undefined);
}
