import type { UserInfo } from '../../types/models';
import { errorText } from '../../utils/error';
import { canAdmin, canManage, guardManage, resolveUser } from '../../utils/role';

interface EntryItem {
  key: string;
  title: string;
  desc: string;
  glyph: string;
  tone: string;
  url: string;
}

interface EntryGroup {
  key: string;
  title: string;
  hint: string;
  items: EntryItem[];
}

function buildGroups(isSuper: boolean): EntryGroup[] {
  const groups: EntryGroup[] = [
    {
      key: 'order',
      title: '订单与采购',
      hint: '先接单，再备菜',
      items: [
        {
          key: 'board',
          title: '订单看板',
          desc: '按日期查看全部订单，进入订单处理并推进状态',
          glyph: '单',
          tone: 'tone-brand',
          url: '/packageMerchant/board/index'
        },
        {
          key: 'purchase',
          title: '采购清单',
          desc: '按天汇总需要准备的食材，已排除取消订单',
          glyph: '采',
          tone: 'tone-amber',
          url: '/packageMerchant/purchase/index'
        }
      ]
    },
    {
      key: 'menu',
      title: '菜品与食材',
      hint: '菜单维护',
      items: [
        {
          key: 'dishes',
          title: '菜品管理',
          desc: '搜索、筛选、上下架与分类管理，进入菜品编辑',
          glyph: '菜',
          tone: 'tone-dark',
          url: '/packageMerchant/dishes/index'
        },
        {
          key: 'dish-new',
          title: '新增菜品',
          desc: '名称、分类、简介、图片与食材配方',
          glyph: '新',
          tone: 'tone-brand',
          url: '/packageMerchant/dish-edit/index'
        },
        {
          key: 'ingredients',
          title: '食材库',
          desc: '新增、改名与启停食材，供菜品配方勾选',
          glyph: '材',
          tone: 'tone-green',
          url: '/packageMerchant/ingredients/index'
        }
      ]
    }
  ];

  if (isSuper) {
    groups.push({
      key: 'admin',
      title: '账号与权限',
      hint: '仅超级用户',
      items: [
        {
          key: 'users',
          title: '用户授权',
          desc: '开启或关闭他人的商家端权限，撤销立即生效',
          glyph: '权',
          tone: 'tone-green',
          url: '/packageAdmin/users/index'
        }
      ]
    });
  }

  return groups;
}

Page({
  data: {
    nickname: '',
    hasMerchant: false,
    isSuper: false,
    groups: [] as EntryGroup[],
    loading: true,
    error: ''
  },

  booted: false,

  onLoad() {
    const cached = getApp<IAppOption>().globalData.user;
    if (cached) this.applyUser(cached);
    this.bootstrap();
  },

  onShow() {
    if (this.booted) this.refreshAccess();
  },

  onPullDownRefresh() {
    this.refreshAccess().then(() => wx.stopPullDownRefresh());
  },

  async bootstrap() {
    this.setData({ loading: true, error: '' });
    let user: UserInfo;
    try {
      user = await resolveUser();
    } catch (err: any) {
      this.setData({ loading: false, error: errorText(err) });
      return;
    }
    if (!guardManage(user)) return;
    this.booted = true;
    this.applyUser(user);
    this.setData({ loading: false, error: '' });
  },

  async refreshAccess() {
    const app = getApp<IAppOption>();
    const user = await app.refreshUser();
    // 网络失败时保留当前页面，避免误判为权限被撤销
    if (!user) return;
    if (!canManage(user)) {
      // 权限被超级用户撤销：不停留在管理页，回到点餐
      this.booted = false;
      wx.showToast({ title: '商家权限已关闭', icon: 'none' });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/customer/menu/index' });
      }, 800);
      return;
    }
    this.applyUser(user);
  },

  applyUser(user: UserInfo) {
    const isSuper = canAdmin(user);
    this.setData({
      nickname: user.nickname || '',
      hasMerchant: canManage(user),
      isSuper,
      groups: buildGroups(isSuper)
    });
  },

  openEntry(e: any) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url });
  },

  retry() {
    this.bootstrap();
  }
});
