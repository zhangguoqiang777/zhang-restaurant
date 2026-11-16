import type { UserInfo } from '../types/models';

const TOKEN_KEY = 'zhang_token';
const USER_KEY = 'zhang_user';

export function getToken(): string {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

export function setToken(token: string) {
  wx.setStorageSync(TOKEN_KEY, token || '');
}

export function clearToken() {
  wx.removeStorageSync(TOKEN_KEY);
}

export function getCachedUser(): UserInfo | null {
  const raw = wx.getStorageSync(USER_KEY);
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  return raw as UserInfo;
}

export function setCachedUser(user: UserInfo) {
  wx.setStorageSync(USER_KEY, user);
}

export function clearAuth() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
}
