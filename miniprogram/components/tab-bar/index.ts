interface TabItem {
  key: string;
  label: string;
  icon: string;
  url: string;
}

Component({
  options: {
    styleIsolation: 'apply-shared'
  },
  properties: {
    /** 是否有商家端能力：决定 tabBar 是 4 项还是 5 项 */
    merchant: {
      type: Boolean,
      value: false
    },
    active: {
      type: String,
      value: 'menu'
    }
  },
  data: {
    tabs: [] as TabItem[]
  },
  observers: {
    merchant() {
      (this as any).refreshTabs();
    }
  },
  lifetimes: {
    attached() {
      (this as any).refreshTabs();
    }
  },
  methods: {
    refreshTabs() {
      this.setData({ tabs: this.getTabs() });
    },

    getTabs(): TabItem[] {
      const tabs: TabItem[] = [
        { key: 'menu', label: '点餐', icon: 'ic-bowl', url: '/pages/customer/menu/index' },
        { key: 'orders', label: '订单', icon: 'ic-receipt', url: '/packageCustomer/orders/index' },
        { key: 'calendar', label: '日历', icon: 'ic-cal', url: '/packageCustomer/calendar/index' }
      ];
      if ((this as any).properties.merchant) {
        tabs.push({ key: 'manage', label: '管理', icon: 'ic-board', url: '/packageCommon/manage/index' });
      }
      tabs.push({ key: 'profile', label: '我的', icon: 'ic-user', url: '/packageCommon/profile/index' });
      return tabs;
    },

    onTap(e: any) {
      const { key, url } = e.currentTarget.dataset;
      if (!url || key === (this as any).properties.active) return;
      wx.reLaunch({ url });
    }
  }
});
