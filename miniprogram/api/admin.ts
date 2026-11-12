import type { AdminUser } from '../types/models';
import { extractList, normalizeAdminUser } from '../utils/normalize';
import { request, withQuery } from './request';

export function fetchAdminUsers(keyword = ''): Promise<AdminUser[]> {
  const url = withQuery('/admin/users', { keyword, page: 1, pageSize: 50 });
  return request<any>({ url }).then((data) =>
    extractList(data && data.users ? data.users : data).map(normalizeAdminUser)
  );
}

export function setMerchantAccess(userId: number, allowed: boolean): Promise<void> {
  return request<any>({
    url: `/admin/users/${userId}/merchant-access`,
    method: 'PATCH',
    data: { allowed }
  }).then(() => undefined);
}
