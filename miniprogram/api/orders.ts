import type { Order, OrderStatus, Review, ReviewItem } from '../types/models';
import { extractList, normalizeOrder, normalizeReview, num } from '../utils/normalize';
import { request, withQuery } from './request';

export interface CreateOrderPayload {
  items: Array<{ dishId: number; qty: number }>;
  remark?: string;
}

export interface SubmitReviewPayload {
  rating: number;
  content?: string;
  items: Array<{ dishId: number; rating: number; content?: string }>;
}

export function createOrder(payload: CreateOrderPayload): Promise<{ id: number; status: OrderStatus }> {
  return request<any>({ url: '/orders', method: 'POST', data: payload }).then((raw) => {
    const source = raw && raw.order ? raw.order : raw || {};
    return {
      id: num(source.id),
      status: (source.status || 'pending') as OrderStatus
    };
  });
}

export function fetchOrders(status?: OrderStatus): Promise<Order[]> {
  const url = withQuery('/orders', { status, page: 1, pageSize: 50 });
  return request<any>({ url }).then((data) => extractList(data && data.orders ? data.orders : data).map(normalizeOrder));
}

export function fetchOrder(id: number): Promise<Order> {
  return request<any>({ url: `/orders/${id}` }).then(normalizeOrder);
}

export function cancelOrder(id: number): Promise<void> {
  return request<any>({ url: `/orders/${id}`, method: 'DELETE' }).then(() => undefined);
}

export function submitReview(orderId: number, payload: SubmitReviewPayload): Promise<void> {
  return request<any>({ url: `/orders/${orderId}/review`, method: 'POST', data: payload }).then(() => undefined);
}

export function fetchOrderReview(orderId: number): Promise<Review | null> {
  return request<any>({ url: `/orders/${orderId}/review` })
    .then((raw) => {
      if (!raw) return null;
      const source = raw.review || raw;
      if (!source || !source.id) return null;
      return normalizeReview(source);
    })
    .catch((err: any) => {
      const code = err && err.code;
      if (code === 'ORDER_NOT_FOUND' || code === 'REVIEW_NOT_FOUND' || code === 'HTTP_404' || err.statusCode === 404) {
        return null;
      }
      throw err;
    });
}

export type { Review, ReviewItem };
