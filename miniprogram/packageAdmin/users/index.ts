import { fetchAdminUsers, setMerchantAccess } from '../../api/admin';
import type { AdminUser, UserInfo } from '../../types/models';
import { errorText, toastError } from '../../utils/error';
import { formatLoginTime, initial, maskOpenid } from '../../utils/format';
import { guardAdmin, resolveUser } from '../../utils/role';

interface AdminUserView extends AdminUser {
  avatarChar: string;
  avatarClass: string;
  openidMasked: string;
  lastText: string;
  statusText: string;
  isSelf: boolean;
  locked: boolean;
}

const AVATAR_TONES = ['', 'amber', 'green'];

function toView(user: AdminUser, selfId: number, index: number): AdminUserView {
  const isSelf = user.id === selfId;
  const locked = isSelf || user.isSuper;
  return {
    ...user,
    avatarChar: initial(user.nickname),
    avatarClass: AVATAR_TONES[index % AVATAR_TONES.length],
    openidMasked: maskOpenid(user.openid),
    lastText: `最近登录：${user.lastLoginAt ? formatLoginTime(user.lastLoginAt) : '—'}`,
    statusText: user.isSuper ? '超级用户 · 不可修改' : user.canMerchant ? '已授权商家端' : '仅客户权限',
    isSelf,
    locked
  };
}

Page({
  data: {
    keyword: '',
    users: [] as AdminUserView[],
    total: 0,
    loading: true,
    error: '',
    busyId: 0
  },

  selfId: 0,
  accessReady: false,
  loadSeq: 0,
  searchTimer: 0,

  onLoad() {
    this.bootstrap();
  },

  async bootstrap() {
    let user: UserInfo;
    try {
      user = await resolveUser();
    } catch (err: any) {
      this.setData({ loading: false, error: errorText(err) });
      return;
    }
    if (!guardAdmin(user)) return;
    this.selfId = user.id;
    this.accessReady = true;
    this.load(true);
  },

  async onShow() {
    if (!this.accessReady) return;
    const app = getApp<IAppOption>();
    const user = await app.refreshUser();
    if (!guardAdmin(user)) {
      this.accessReady = false;
      return;
    }
    this.selfId = user.id;
    this.load(false);
  },

  onUnload() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = 0;
    }
  },

  async onPullDownRefresh() {
    const app = getApp<IAppOption>();
    const user = await app.refreshUser();
    if (!guardAdmin(user)) {
      wx.stopPullDownRefresh();
      return;
    }
    this.selfId = user.id;
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  async load(showLoading: boolean): Promise<void> {
    const seq = ++this.loadSeq;
    if (showLoading) this.setData({ loading: true, error: '' });
    try {
      const list = await fetchAdminUsers(this.data.keyword.trim());
      if (seq !== this.loadSeq) return;
      const users = list.map((item, index) => toView(item, this.selfId, index));
      this.setData({ users, total: users.length, loading: false, error: '' });
    } catch (err: any) {
      if (seq !== this.loadSeq) return;
      if (showLoading || !this.data.users.length) {
        this.setData({ loading: false, error: errorText(err) });
      }
    }
  },

  onKeyword(e: any) {
    this.setData({ keyword: e.detail.value || '' });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = 0;
      this.load(false);
    }, 350);
  },

  clearKeyword() {
    this.setData({ keyword: '' });
    this.load(false);
  },

  async toggleAccess(e: any) {
    const id = Number(e.currentTarget.dataset.id);
    const user = this.data.users.find((item) => item.id === id);
    if (!user || user.locked || this.data.busyId) return;
    const next = !user.canMerchant;
    this.setData({
      busyId: id,
      users: this.data.users.map((item) =>
        item.id === id
          ? {
              ...item,
              canMerchant: next,
              statusText: next ? '已授权商家端' : '仅客户权限'
            }
          : item
      )
    });
    try {
      await setMerchantAccess(id, next);
      wx.showToast({ title: next ? '已开启商家端' : '已关闭商家端', icon: 'none' });
    } catch (err: any) {
      toastError(err);
      await this.load(false);
    } finally {
      this.setData({ busyId: 0 });
    }
  },

  retry() {
    this.load(true);
  }
});
