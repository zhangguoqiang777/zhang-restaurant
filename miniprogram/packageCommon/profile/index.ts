import { fetchMe } from '../../api/auth';
import { getBaseUrl, resetBaseUrl, setBaseUrl } from '../../api/config';
import type { UserInfo } from '../../types/models';
import { toastError } from '../../utils/error';
import { formatLoginTime, initial, maskOpenid } from '../../utils/format';
import { canAdmin, canManage } from '../../utils/role';
import { getCachedUser } from '../../utils/storage';

interface PermissionRow {
  key: string;
  title: string;
  desc: string;
  glyph: string;
  tone: string;
  granted: boolean;
  statusText: string;
}

Page({
  data: {
    user: {} as UserInfo,
    avatarChar: '客',
    openidMasked: '',
    lastLoginText: '—',
    baseUrl: '',
    hasMerchant: false,
    isSuper: false,
    permissions: [] as PermissionRow[]
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
    const hasMerchant = canManage(user);
    const isSuper = canAdmin(user);
    const permissions: PermissionRow[] = [
      {
        key: 'customer',
        title: '点餐与订单',
        desc: '菜单、购物车、订单、日历与评价',
        glyph: '客',
        tone: 'tone-brand',
        granted: true,
        statusText: '可用'
      },
      {
        key: 'merchant',
        title: '商家管理',
        desc: '订单看板、采购清单、菜品与食材',
        glyph: '管',
        tone: 'tone-dark',
        granted: hasMerchant,
        statusText: hasMerchant ? '可用' : '未开通'
      },
      {
        key: 'admin',
        title: '用户授权',
        desc: '授权或撤销他人的商家端权限',
        glyph: '权',
        tone: 'tone-green',
        granted: isSuper,
        statusText: isSuper ? '可用' : '仅超级用户'
      }
    ];

    this.setData({
      user,
      permissions,
      hasMerchant,
      isSuper,
      avatarChar: initial(user.nickname),
      openidMasked: maskOpenid(user.openid),
      lastLoginText: formatLoginTime(user.lastLoginAt),
      baseUrl: getBaseUrl()
    });
  },

  goManage() {
    if (!this.data.hasMerchant) return;
    wx.reLaunch({ url: '/packageCommon/manage/index' });
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
