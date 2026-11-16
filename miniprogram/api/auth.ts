import type { LoginResult, UserInfo } from '../types/models';
import { normalizeUser, num, str } from '../utils/normalize';
import { request } from './request';

export function wxLogin(code: string): Promise<LoginResult> {
  return request<any>({
    url: '/auth/wx-login',
    method: 'POST',
    data: { code },
    auth: false,
    retried: true
  }).then((raw) => {
    const source = raw || {};
    const user = source.user || {};
    return {
      token: str(source.token || source.accessToken),
      userId: num(source.userId !== undefined ? source.userId : source.user_id !== undefined ? source.user_id : user.id),
      isSuper: !!(source.isSuper !== undefined ? source.isSuper : source.is_super !== undefined ? source.is_super : user.isSuper),
      canMerchant: !!(
        source.canMerchant !== undefined
          ? source.canMerchant
          : source.can_merchant !== undefined
            ? source.can_merchant
            : user.canMerchant
      ),
      nickname: str(source.nickname || user.nickname)
    };
  });
}

export function fetchMe(): Promise<UserInfo> {
  return request<any>({ url: '/me' }).then(normalizeUser);
}
