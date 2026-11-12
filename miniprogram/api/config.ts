const BASE_URL_KEY = 'zhang_api_base_url';
const DEFAULT_BASE_URL = 'http://localhost:3000';
export const API_PREFIX = '/api/v1';

/**
 * baseUrl 只填协议 + 域名 + 端口，例如 http://localhost:3000。
 * 可在「我的 → 开发设置」临时修改，也可直接改这里作为默认值。
 */
export function getBaseUrl(): string {
  const custom = wx.getStorageSync(BASE_URL_KEY);
  return String(custom || DEFAULT_BASE_URL)
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/, '');
}

export function setBaseUrl(url: string): string {
  const normalized = String(url || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/, '');
  wx.setStorageSync(BASE_URL_KEY, normalized);
  return normalized;
}

export function resetBaseUrl() {
  wx.removeStorageSync(BASE_URL_KEY);
}

export function getApiBase(): string {
  return `${getBaseUrl()}${API_PREFIX}`;
}

/**
 * 图片只存 image_key（相对路径），展示时拼域名；Caddy 直接托管 /uploads。
 */
export function assetUrl(key?: string): string {
  const value = String(key || '');
  if (!value) return '';
  if (/^https?:\/\//.test(value)) return value;
  return `${getBaseUrl()}/uploads/${value.replace(/^\/+/, '')}`;
}
