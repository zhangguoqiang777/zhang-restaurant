import type { CalendarDay, Order } from '../types/models';
import { extractList, normalizeCalendarDay, normalizeOrder } from '../utils/normalize';
import { request } from './request';

export function fetchCalendarMonth(month: string): Promise<CalendarDay[]> {
  return request<any>({ url: `/calendar?month=${encodeURIComponent(month)}` }).then((data) =>
    extractList(data && data.days ? data.days : data).map(normalizeCalendarDay)
  );
}

export function fetchCalendarDay(date: string): Promise<Order[]> {
  return request<any>({ url: `/calendar/${encodeURIComponent(date)}` }).then((data) =>
    extractList(data && data.orders ? data.orders : data).map(normalizeOrder)
  );
}
