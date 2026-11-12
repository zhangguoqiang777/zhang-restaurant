Component({
  options: {
    styleIsolation: 'apply-shared'
  },
  properties: {
    role: {
      type: String,
      value: 'customer'
    },
    active: {
      type: String,
      value: 'menu'
    }
  },
  data: {
    tabs: [] as any[]
  },
  observers: {
    role(value: string) {
      const tabs = this.getTabs(value);
      this.setData({ tabs });
    }
  },
  lifetimes: {
    attached() {
      const tabs = this.getTabs((this as any).properties.role);
      this.setData({ tabs });
    }
  },
  methods: {
    getTabs(role: string): any[] {
      const profileBase = '/packageCommon/profile/index?role=';
      if (role === 'merchant') {
        return [
          { key: 'board', label: '订单', icon: 'ic-board', url: '/packageMerchant/board/index' },
          { key: 'purchase', label: '采购', icon: 'ic-basket', url: '/packageMerchant/purchase/index' },
          { key: 'dishes', label: '菜品', icon: 'ic-dish', url: '/packageMerchant/dishes/index' },
          { key: 'profile', label: '我的', icon: 'ic-user', url: `${profileBase}merchant` }
        ];
      }
      if (role === 'admin') {
        return [
          { key: 'users', label: '用户', icon: 'ic-shield', url: '/packageAdmin/users/index' },
          { key: 'board', label: '订单', icon: 'ic-board', url: '/packageMerchant/board/index' },
          { key: 'purchase', label: '采购', icon: 'ic-basket', url: '/packageMerchant/purchase/index' },
          { key: 'dishes', label: '菜品', icon: 'ic-dish', url: '/packageMerchant/dishes/index' },
          { key: 'profile', label: '我的', icon: 'ic-user', url: `${profileBase}admin` }
        ];
      }
      return [
        { key: 'menu', label: '点餐', icon: 'ic-bowl', url: '/pages/customer/menu/index' },
        { key: 'orders', label: '订单', icon: 'ic-receipt', url: '/packageCustomer/orders/index' },
        { key: 'calendar', label: '日历', icon: 'ic-cal', url: '/packageCustomer/calendar/index' },
        { key: 'profile', label: '我的', icon: 'ic-user', url: `${profileBase}customer` }
      ];
    },
    onTap(e: any) {
      const { key, url } = e.currentTarget.dataset;
      if (!url || key === (this as any).properties.active) return;
      wx.reLaunch({ url });
    }
  }
});
