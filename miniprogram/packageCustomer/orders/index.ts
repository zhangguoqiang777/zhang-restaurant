import { cancelOrder, fetchOrders } from '../../api/orders';
import type { Order, OrderItem } from '../../types/models';
import { errorText, toastError } from '../../utils/error';
import { formatClock, formatOrderTime, statusPillClass, statusText } from '../../utils/format';

interface OrderView extends Order {
  statusText: string;
  pillClass: string;
  timeText: string;
  summary: string;
  thumbs: OrderItem[];
  canCancel: boolean;
  canReview: boolean;
  footText: string;
}

function toView(order: Order): OrderView {
  const summary = order.items.map((item) => `${item.nameZh} × ${item.qty}`).join(' · ');
  let footText = '等待商家接单';
  if (order.status === 'cooking') {
    footText = `开始于 ${formatClock(order.cookingAt)} · 正在制作`;
  } else if (order.status === 'completed') {
    footText = order.reviewed ? '已完成 · 已评价' : '已完成 · 等你评价';
  }
  return {
    ...order,
    statusText: statusText(order.status),
    pillClass: statusPillClass(order.status),
    timeText: formatOrderTime(order.createdAt),
    summary: summary || '订单明细',
    thumbs: order.items.slice(0, 2),
    canCancel: order.status === 'pending',
    canReview: order.status === 'completed' && !order.reviewed,
    footText
  };
}

Page({
  data: {
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'pending', label: '待处理' },
      { key: 'cooking', label: '制作中' },
      { key: 'completed', label: '已完成' }
    ],
    status: 'all',
    orders: [] as OrderView[],
    allOrders: [] as OrderView[],
    loading: true,
    error: ''
  },

  timer: 0,
  loadingLock: false,

  onLoad() {
    this.load(true);
  },

  onShow() {
    if (!this.data.loading) this.load(false);
    this.startTimer();
  },

  onHide() {
    this.stopTimer();
  },

  onUnload() {
    this.stopTimer();
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  startTimer() {
    this.stopTimer();
    this.timer = setInterval(() => {
      this.load(false);
    }, 30000);
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  },

  async load(showLoading: boolean): Promise<void> {
    if (this.loadingLock) return;
    this.loadingLock = true;
    if (showLoading) this.setData({ loading: true, error: '' });
    try {
      const orders = await fetchOrders();
      const all = orders.map(toView);
      this.setData({ allOrders: all, loading: false, error: '' }, () => this.applyFilter());
    } catch (err: any) {
      if (showLoading || !this.data.allOrders.length) {
        this.setData({ loading: false, error: errorText(err) });
      }
    } finally {
      this.loadingLock = false;
    }
  },

  applyFilter() {
    const status = this.data.status;
    const orders =
      status === 'all' ? this.data.allOrders : this.data.allOrders.filter((item) => item.status === status);
    this.setData({ orders });
  },

  onTab(e: any) {
    const key = e.currentTarget.dataset.key;
    this.setData({ status: key }, () => this.applyFilter());
  },

  goDetail(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/packageCustomer/order-detail/index?id=${id}` });
  },

  goReview(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/packageCustomer/review/index?orderId=${id}` });
  },

  cancelOrder(e: any) {
    const id = Number(e.currentTarget.dataset.id);
    wx.showModal({
      title: '取消这一单？',
      content: '取消后商家将不再看到这一单。',
      confirmText: '取消订单',
      confirmColor: '#A5483B',
      success: async (res: any) => {
        if (!res.confirm) return;
        try {
          await cancelOrder(id);
          wx.showToast({ title: '已取消', icon: 'none' });
          this.load(false);
        } catch (err: any) {
          toastError(err);
          this.load(false);
        }
      }
    });
  },

  goMenu() {
    wx.reLaunch({ url: '/pages/customer/menu/index' });
  },

  retry() {
    this.load(true);
  }
});
