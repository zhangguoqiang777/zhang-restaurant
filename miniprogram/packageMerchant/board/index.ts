import { completeOrder, fetchMerchantOrders, startOrder } from '../../api/merchant';
import type { Order } from '../../types/models';
import { errorText, toastError } from '../../utils/error';
import {
  dateKey,
  formatClock,
  formatDateCN,
  formatOrderTime,
  initial,
  statusPillClass,
  statusText,
  todayKey
} from '../../utils/format';
import { guardRole } from '../../utils/role';
import { getLastRole } from '../../utils/storage';

interface BoardOrder extends Order {
  statusText: string;
  pillClass: string;
  timeText: string;
  customerName: string;
  avatarChar: string;
  totalQty: number;
  footHint: string;
}

interface BoardGroup {
  key: string;
  title: string;
  hint: string;
  orders: BoardOrder[];
}

function toView(order: Order): BoardOrder {
  let footHint = `下单于 ${formatClock(order.createdAt)} · 等待接单`;
  if (order.status === 'cooking') {
    footHint = `开始于 ${formatClock(order.cookingAt)} · 制作中`;
  } else if (order.status === 'completed') {
    footHint = `完成于 ${formatClock(order.completedAt)}`;
  }
  return {
    ...order,
    statusText: statusText(order.status),
    pillClass: statusPillClass(order.status),
    timeText: formatOrderTime(order.createdAt),
    customerName: order.customerNickname || `用户 #${order.customerId}`,
    avatarChar: initial(order.customerNickname),
    totalQty: order.items.reduce((sum, item) => sum + item.qty, 0),
    footHint
  };
}

function shiftDate(key: string, delta: number): string {
  const parts = key.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2] + delta);
  return dateKey(date);
}

function labelOf(key: string): string {
  const label = formatDateCN(key);
  if (key === todayKey()) return `今天 · ${label}`;
  const yesterday = shiftDate(todayKey(), -1);
  if (key === yesterday) return `昨天 · ${label}`;
  return label;
}

Page({
  data: {
    date: '',
    dateLabel: '',
    isToday: true,
    stats: { pending: 0, cooking: 0, completed: 0 },
    groups: [] as BoardGroup[],
    loading: true,
    error: '',
    processingId: 0,
    viewRole: 'merchant'
  },

  timer: 0,
  loadSeq: 0,
  accessReady: false,

  onLoad() {
    const date = todayKey();
    this.setData({ date, dateLabel: labelOf(date), isToday: true });
    this.bootstrap();
  },

  async bootstrap() {
    const app = getApp<IAppOption>();
    let user;
    try {
      user = await app.ensureLogin();
    } catch (err: any) {
      this.setData({ loading: false, error: errorText(err) });
      return;
    }
    if (!guardRole('merchant', user)) return;
    this.setData({ viewRole: user.isSuper && getLastRole() === 'admin' ? 'admin' : 'merchant' });
    this.accessReady = true;
    this.load(true);
    this.startTimer();
  },

  onShow() {
    if (this.accessReady) {
      this.load(false);
      this.startTimer();
    }
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
    this.timer = setInterval(() => this.load(false), 30000);
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  },

  async load(showLoading: boolean): Promise<void> {
    const seq = ++this.loadSeq;
    if (showLoading) this.setData({ loading: true, error: '' });
    try {
      const raw = await fetchMerchantOrders(this.data.date);
      if (seq !== this.loadSeq) return;
      const orders = raw.map(toView);
      const pending = orders.filter((item) => item.status === 'pending');
      const cooking = orders.filter((item) => item.status === 'cooking');
      const completed = orders.filter((item) => item.status === 'completed');
      const groups: BoardGroup[] = [
        { key: 'pending', title: '待处理', hint: '先接单', orders: pending },
        { key: 'cooking', title: '制作中', hint: '做好后点完成', orders: cooking },
        { key: 'completed', title: '已完成', hint: '可按订单号回看', orders: completed }
      ];
      this.setData({
        groups,
        stats: { pending: pending.length, cooking: cooking.length, completed: completed.length },
        loading: false,
        error: ''
      });
    } catch (err: any) {
      if (seq !== this.loadSeq) return;
      if (
        showLoading ||
        this.data.stats.pending + this.data.stats.cooking + this.data.stats.completed === 0
      ) {
        this.setData({ loading: false, error: errorText(err) });
      }
    }
  },

  onDateChange(e: any) {
    const date = e.detail.value;
    this.setData({
      date,
      dateLabel: labelOf(date),
      isToday: date === todayKey(),
      groups: [],
      stats: { pending: 0, cooking: 0, completed: 0 }
    });
    this.load(true);
  },

  prevDay() {
    this.changeDate(-1);
  },

  nextDay() {
    this.changeDate(1);
  },

  changeDate(delta: number) {
    const date = shiftDate(this.data.date, delta);
    this.setData({
      date,
      dateLabel: labelOf(date),
      isToday: date === todayKey(),
      groups: [],
      stats: { pending: 0, cooking: 0, completed: 0 }
    });
    this.load(true);
  },

  goToday() {
    const date = todayKey();
    this.setData({
      date,
      dateLabel: labelOf(date),
      isToday: true,
      groups: [],
      stats: { pending: 0, cooking: 0, completed: 0 }
    });
    this.load(true);
  },

  async advance(e: any) {
    const id = Number(e.currentTarget.dataset.id);
    const action = e.currentTarget.dataset.action;
    if (this.data.processingId) return;
    this.setData({ processingId: id });
    try {
      if (action === 'start') {
        await startOrder(id);
        wx.showToast({ title: '已开始制作', icon: 'none' });
      } else {
        await completeOrder(id);
        wx.showToast({ title: '已完成', icon: 'none' });
      }
      await this.load(false);
    } catch (err: any) {
      toastError(err);
      this.load(false);
    } finally {
      this.setData({ processingId: 0 });
    }
  },

  goDetail(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/packageMerchant/order-detail/index?id=${id}` });
  },

  retry() {
    this.load(true);
  }
});
