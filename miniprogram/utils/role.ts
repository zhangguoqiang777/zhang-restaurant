import type { Role, UserInfo } from '../types/models';

export interface RoleOption {
  key: Role;
  title: string;
  desc: string;
  glyph: string;
  iconClass: string;
  home: string;
}

export const ROLE_META: Record<Role, RoleOption> = {
  customer: {
    key: 'customer',
    title: '我是吃饭人',
    desc: '看菜单、下单、查订单、评价与日历',
    glyph: '客',
    iconClass: 'tone-brand',
    home: '/pages/customer/menu/index'
  },
  merchant: {
    key: 'merchant',
    title: '我是做饭人',
    desc: '接单、推进制作、采购与菜品维护',
    glyph: '厨',
    iconClass: 'tone-dark',
    home: '/packageMerchant/board/index'
  },
  admin: {
    key: 'admin',
    title: '超级用户',
    desc: '授权商家端访问，查看全部已登录用户',
    glyph: '权',
    iconClass: 'tone-green',
    home: '/packageAdmin/users/index'
  }
};

export function roleHome(role: Role): string {
  return ROLE_META[role].home;
}

export function roleTitle(role: Role): string {
  return ROLE_META[role].title;
}

export function availableRoles(user?: UserInfo | null): RoleOption[] {
  const list: RoleOption[] = [ROLE_META.customer];
  if (user && (user.canMerchant || user.isSuper)) list.push(ROLE_META.merchant);
  if (user && user.isSuper) list.push(ROLE_META.admin);
  return list;
}

export function canEnter(role: Role, user?: UserInfo | null): boolean {
  if (role === 'customer') return true;
  if (!user) return false;
  if (role === 'merchant') return user.isSuper || user.canMerchant;
  return user.isSuper;
}

/**
 * 页面级角色守卫。无权限时提示并回到入口页。
 * 返回 false 时调用方应立即停止后续请求。
 */
export function guardRole(role: Role, user?: UserInfo | null): boolean {
  if (canEnter(role, user)) return true;
  wx.showToast({ title: '当前账号没有该视角权限', icon: 'none' });
  setTimeout(() => {
    wx.reLaunch({ url: '/pages/entry/index?force=1' });
  }, 700);
  return false;
}
