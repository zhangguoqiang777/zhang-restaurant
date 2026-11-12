import { createOrder } from '../../api/orders';
import type { CartItem } from '../../types/models';
import { cartCount, cartKinds, clearCart, loadCart, updateQty } from '../../utils/cart';
import { toastError } from '../../utils/error';

Page({
  data: {
    items: [] as CartItem[],
    count: 0,
    kinds: 0,
    remark: '',
    remarkLen: 0,
    submitting: false
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const items = loadCart();
    this.setData({
      items,
      count: cartCount(items),
      kinds: cartKinds(items)
    });
  },

  minus(e: any) {
    const id = Number(e.currentTarget.dataset.id);
    const qty = Number(e.currentTarget.dataset.qty);
    updateQty(id, qty - 1);
    this.refresh();
  },

  plus(e: any) {
    const id = Number(e.currentTarget.dataset.id);
    const qty = Number(e.currentTarget.dataset.qty);
    if (qty >= 99) return;
    updateQty(id, qty + 1);
    this.refresh();
  },

  onRemark(e: any) {
    const value = e.detail.value || '';
    this.setData({ remark: value, remarkLen: value.length });
  },

  clearAll() {
    if (!this.data.items.length) return;
    wx.showModal({
      title: '清空购物车？',
      content: '已选菜品会全部移除。',
      confirmText: '清空',
      confirmColor: '#C0603C',
      success: (res: any) => {
        if (!res.confirm) return;
        clearCart();
        this.refresh();
      }
    });
  },

  goMenu() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.reLaunch({ url: '/pages/customer/menu/index' });
    }
  },

  async submit() {
    if (this.data.submitting) return;
    const items = this.data.items;
    if (!items.length) {
      wx.showToast({ title: '购物车是空的', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const result = await createOrder({
        items: items.map((item) => ({ dishId: item.dishId, qty: item.qty })),
        remark: this.data.remark
      });
      clearCart();
      this.setData({ submitting: false, items: [], count: 0, kinds: 0 });
      wx.showToast({ title: '订单已提交', icon: 'success', duration: 900 });
      const target = result.id
        ? `/packageCustomer/order-detail/index?id=${result.id}`
        : '/packageCustomer/orders/index';
      setTimeout(() => {
        wx.redirectTo({ url: target });
      }, 700);
    } catch (err: any) {
      this.setData({ submitting: false });
      toastError(err);
    }
  }
});
