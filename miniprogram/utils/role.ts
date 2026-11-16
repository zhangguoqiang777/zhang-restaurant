import type { UserInfo } from '../types/models';

/** 是否有商家端能力：被授权的商家或超级用户 */
export function canManage(user?: UserInfo | null): boolean {
  return !!user && (user.isSuper || user.canMerchant);
}

export function canAdmin(user?: UserInfo | null): boolean {
  return !!user && user.isSuper;
}

/**
 * 登录并校准最新权限。冷启动、直接进入商家页时使用，
 * 避免沿用缓存里的旧 canMerchant / isSuper。
 */
export async function resolveUser(): Promise<UserInfo> {
  const app = getApp<IAppOption>();
  const user = await app.ensureLogin();
  const fresh = await app.refreshUser();
  return fresh || user;
}

/** 跳到当前账号可访问的首页：有管理权限去管理页，否则回点餐页 */
export function redirectToAccessible(user?: UserInfo | null) {
  wx.reLaunch({
    url: canManage(user) ? '/packageCommon/manage/index' : '/pages/customer/menu/index'
  });
}

/**
 * 商家页面守卫。无权限时静默回到可访问页面，不弹无信息错误。
 * 返回 false 时调用方应立即停止后续请求。
 */
export function guardManage(user?: UserInfo | null): boolean {
  if (canManage(user)) return true;
  redirectToAccessible(user);
  return false;
}

/** 超级用户页面守卫。非超管按权限回到管理页或点餐页 */
export function guardAdmin(user?: UserInfo | null): boolean {
  if (canAdmin(user)) return true;
  redirectToAccessible(user);
  return false;
}
