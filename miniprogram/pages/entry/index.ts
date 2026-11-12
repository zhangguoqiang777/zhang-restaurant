import { updateMe } from '../../api/auth';
import type { Role, UserInfo } from '../../types/models';
import { errorText } from '../../utils/error';
import { normalizeRole } from '../../utils/normalize';
import { availableRoles, roleHome } from '../../utils/role';
import type { RoleOption } from '../../utils/role';
import { setLastRole } from '../../utils/storage';

const SHORT_TITLE: Record<string, string> = {
  customer: '客户',
  merchant: '商家',
  admin: '超级用户'
};

Page({
  data: {
    topPad: 80,
    user: null as UserInfo | null,
    roles: [] as RoleOption[],
    selected: 'customer' as Role,
    buttonText: '进入客户视角',
    loading: true,
    entering: false,
    error: ''
  },

  forceShow: false,

  onLoad(query: any) {
    this.forceShow = !!(query && query.force === '1');
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const topPad = (info.statusBarHeight || 20) + 52;
    this.setData({ topPad });
    this.init(false);
  },

  async init(force: boolean) {
    const app = getApp<IAppOption>();
    this.setData({ loading: true, error: '' });
    try {
      const user = await app.ensureLogin(force);
      this.applyUser(user);
    } catch (err: any) {
      const cached = app.globalData.user;
      if (cached) {
        this.applyUser(cached);
      } else {
        this.setData({ loading: false, error: errorText(err) });
      }
    }
  },

  applyUser(user: UserInfo) {
    const roles = availableRoles(user);
    let selected = normalizeRole(user.lastRole);
    if (!roles.some((role) => role.key === selected)) {
      selected = roles[0].key;
    }
    if (!this.forceShow && roles.length === 1) {
      this.setData({ loading: false });
      wx.reLaunch({ url: roles[0].home });
      return;
    }
    this.setData({
      user,
      roles,
      selected,
      loading: false,
      error: '',
      buttonText: `进入${SHORT_TITLE[selected]}视角`
    });
  },

  onSelect(e: any) {
    const key = e.currentTarget.dataset.key as Role;
    this.setData({
      selected: key,
      buttonText: `进入${SHORT_TITLE[key]}视角`
    });
  },

  enter() {
    if (this.data.entering) return;
    const role = this.data.selected;
    const app = getApp<IAppOption>();
    setLastRole(role);
    if (app.globalData.user) {
      app.setUser({ ...app.globalData.user, lastRole: role });
    }
    this.setData({ entering: true });
    updateMe({ lastRole: role })
      .then((user) => app.setUser(user))
      .catch(() => undefined);
    wx.reLaunch({ url: roleHome(role) });
  },

  retry() {
    this.init(true);
  }
});
