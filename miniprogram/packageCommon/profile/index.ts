import { fetchMe, updateMe } from '../../api/auth';
import { getBaseUrl, resetBaseUrl, setBaseUrl } from '../../api/config';
import type { Role, UserInfo } from '../../types/models';
import { toastError } from '../../utils/error';
import { formatLoginTime, initial, maskOpenid } from '../../utils/format';
import { normalizeRole } from '../../utils/normalize';
import { availableRoles, canEnter, roleHome } from '../../utils/role';
import type { RoleOption } from '../../utils/role';
import { getCachedUser, getLastRole, setLastRole } from '../../utils/storage';

interface RoleTile extends RoleOption {
  shortTitle: string;
  shortDesc: string;
}

interface ProfileLink {
  key: string;
  title: string;
  desc: string;
  glyph: string;
  iconClass: string;
  url: string;
  tab: boolean;
}

const ROLE_SHORT: Record<string, { title: string; desc: string }> = {
  customer: { title: '客户', desc: '点餐 · 订单 · 日历' },
  merchant: { title: '商家', desc: '接单 · 采购 · 菜品' },
  admin: { title: '超级用户', desc: '授权与管理' }
};

const CUSTOMER_LINKS: ProfileLink[] = [
  {
    key: 'orders',
    title: '我的订单',
    desc: '查看进度、取消与评价',
    glyph: '单',
    iconClass: 'tone-brand',
    url: '/packageCustomer/orders/index',
    tab: true
  },
  {
    key: 'calendar',
    title: '日历',
    desc: '按天回看这一餐',
    glyph: '历',
    iconClass: 'tone-amber',
    url: '/packageCustomer/calendar/index',
    tab: true
  },
  {
    key: 'menu',
    title: '去点餐',
    desc: '看看今天有什么',
    glyph: '点',
    iconClass: 'tone-dark',
    url: '/pages/customer/menu/index',
    tab: true
  }
];

const MERCHANT_LINKS: ProfileLink[] = [
  {
    key: 'board',
    title: '订单看板',
    desc: '按日期接单、推进制作',
    glyph: '单',
    iconClass: 'tone-brand',
    url: '/packageMerchant/board/index',
    tab: true
  },
  {
    key: 'purchase',
    title: '采购清单',
    desc: '按天汇总需要准备的食材',
    glyph: '采',
    iconClass: 'tone-amber',
    url: '/packageMerchant/purchase/index',
    tab: true
  },
  {
    key: 'dishes',
    title: '菜品管理',
    desc: '分类、上下架、编辑',
    glyph: '菜',
    iconClass: 'tone-dark',
    url: '/packageMerchant/dishes/index',
    tab: true
  },
  {
    key: 'ingredients',
    title: '食材库',
    desc: '维护食材并启停',
    glyph: '材',
    iconClass: 'tone-green',
    url: '/packageMerchant/ingredients/index',
    tab: false
  }
];

const ADMIN_LINKS: ProfileLink[] = [
  {
    key: 'users',
    title: '用户授权',
    desc: '开启或关闭商家端访问',
    glyph: '权',
    iconClass: 'tone-green',
    url: '/packageAdmin/users/index',
    tab: true
  },
  {
    key: 'board',
    title: '订单看板',
    desc: '查看自制订单并推进状态',
    glyph: '单',
    iconClass: 'tone-brand',
    url: '/packageMerchant/board/index',
    tab: true
  }
];

Page({
  data: {
    role: 'customer' as Role,
    requestedRole: '',
    user: {} as UserInfo,
    roles: [] as RoleTile[],
    links: [] as ProfileLink[],
    avatarChar: '客',
    openidMasked: '',
    lastLoginText: '—',
    currentRoleTitle: '客户',
    baseUrl: '',
    loaded: false
  },

  onLoad(query: any) {
    const raw = query && query.role ? String(query.role) : '';
    this.setData({ requestedRole: raw, role: normalizeRole(raw) });
  },

  onShow() {
    this.loadProfile();
  },

  async loadProfile() {
    const app = getApp<IAppOption>();
    let user: UserInfo | null = app.globalData.user || getCachedUser();
    if (!user) {
      try {
        user = await app.ensureLogin();
      } catch (err: any) {
        toastError(err);
        return;
      }
    }
    this.applyUser(user);

    // 权限可能刚被超级用户修改，静默刷新一次
    try {
      const me = await fetchMe();
      app.setUser(me);
      this.applyUser(me);
    } catch (err: any) {
      // 保留缓存展示；401 由请求层处理
    }
  },

  applyUser(user: UserInfo) {
    const requested = this.data.requestedRole;
    let role = normalizeRole(requested || user.lastRole || getLastRole());
    if (!canEnter(role, user)) role = 'customer';

    const roles: RoleTile[] = availableRoles(user).map((item) => ({
      ...item,
      shortTitle: ROLE_SHORT[item.key].title,
      shortDesc: ROLE_SHORT[item.key].desc
    }));

    let links = CUSTOMER_LINKS;
    if (role === 'merchant') links = MERCHANT_LINKS;
    if (role === 'admin') links = ADMIN_LINKS;

    setLastRole(role);
    this.setData({
      user,
      role,
      roles,
      links,
      avatarChar: initial(user.nickname),
      openidMasked: maskOpenid(user.openid),
      lastLoginText: formatLoginTime(user.lastLoginAt),
      currentRoleTitle: ROLE_SHORT[role].title,
      baseUrl: getBaseUrl(),
      loaded: true
    });
  },

  switchRole(e: any) {
    const key = e.currentTarget.dataset.key as Role;
    if (key === this.data.role) return;
    if (!canEnter(key, this.data.user)) {
      wx.showToast({ title: '没有该视角权限', icon: 'none' });
      return;
    }
    const app = getApp<IAppOption>();
    setLastRole(key);
    if (app.globalData.user) {
      app.setUser({ ...app.globalData.user, lastRole: key });
    }
    updateMe({ lastRole: key })
      .then((user) => app.setUser(user))
      .catch(() => undefined);
    wx.reLaunch({ url: roleHome(key) });
  },

  openLink(e: any) {
    const { url, tab } = e.currentTarget.dataset;
    if (!url) return;
    if (tab === true || tab === 'true') {
      wx.reLaunch({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  editBaseUrl() {
    wx.showActionSheet({
      itemList: ['修改接口地址', '恢复默认'],
      success: (res: any) => {
        if (res.tapIndex === 0) {
          this.promptBaseUrl();
        } else if (res.tapIndex === 1) {
          resetBaseUrl();
          this.setData({ baseUrl: getBaseUrl() });
          wx.showToast({ title: '已恢复默认', icon: 'none' });
        }
      }
    });
  },

  promptBaseUrl() {
    wx.showModal({
      title: '修改接口地址',
      editable: true,
      placeholderText: this.data.baseUrl,
      confirmText: '保存',
      confirmColor: '#C0603C',
      success: (res: any) => {
        if (!res.confirm) return;
        const value = String(res.content || '').trim();
        if (!value) return;
        if (!/^https?:\/\//.test(value)) {
          wx.showToast({ title: '请填写 http(s):// 开头的地址', icon: 'none' });
          return;
        }
        setBaseUrl(value);
        this.setData({ baseUrl: getBaseUrl() });
        wx.showToast({ title: '已保存，重新进入后生效', icon: 'none' });
      }
    });
  }
});
