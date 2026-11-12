import {
  cancelMerchantOrder,
  completeOrder,
  fetchMerchantOrder,
  startOrder
} from '../../api/merchant';
import type { Order } from '../../types/models';
import { errorText, toastError } from '../../utils/error';
import { formatOrderTime, initial, statusPillClass, statusText } from '../../utils/format';
import { guardRole } from '../../utils/role';

interface TimelineNode {
  key: string;
  title: string;
  time: string;
  state: string;
}

interface MerchantDetailView extends Order {
  statusText: string;
  pillClass: string;
  createdText: string;
  totalQty: number;
  customerName: string;
  avatarChar: string;
  bannerTitle: string;
  bannerDesc: string;
  bannerGlyph: string;
  step2Class: string;
  step3Class: string;
  line1Class: string;
  line2Class: string;
  timeline: TimelineNode[];
}

function toView(order: Order): MerchantDetailView {
  const cooking = order.status === 'cooking';
  const completed = order.status === 'completed';
  let bannerTitle = '等待接单';
  let bannerDesc = '确认后点「开始制作」，客户会看到状态变化。';
  let bannerGlyph = '候';
  if (cooking) {
    bannerTitle = '正在制作';
    bannerDesc = '做好后点「完成制作」，这一单就结束了。';
    bannerGlyph = '做';
  } else if (completed) {
    bannerTitle = '已完成';
    bannerDesc = '这一单制作完成，客户可以评价。';
    bannerGlyph = '成';
  }

  const timeline: TimelineNode[] = [
    {
      key: 'created',
      title: '客户下单',
      time: formatOrderTime(order.createdAt),
      state: 'done'
    },
    {
      key: 'cooking',
      title: '开始制作',
      time: order.cookingAt ? formatOrderTime(order.cookingAt) : '等待中',
      state: cooking ? 'now' : order.completedAt ? 'done' : ''
    },
    {
      key: 'completed',
      title: '完成制作',
      time: order.completedAt ? formatOrderTime(order.completedAt) : '等待中',
      state: completed ? 'done' : ''
    }
  ];

  return {
    ...order,
    statusText: statusText(order.status),
    pillClass: statusPillClass(order.status),
    createdText: formatOrderTime(order.createdAt),
    totalQty: order.items.reduce((sum, item) => sum + item.qty, 0),
    customerName: order.customerNickname || `用户 #${order.customerId}`,
    avatarChar: initial(order.customerNickname),
    bannerTitle,
    bannerDesc,
    bannerGlyph,
    step2Class: order.cookingAt ? (cooking ? 'now' : 'done') : '',
    step3Class: completed ? 'done' : '',
    line1Class: order.cookingAt ? 'done' : '',
    line2Class: completed ? 'done' : '',
    timeline
  };
}

Page({
  data: {
    id: 0,
    detail: null as MerchantDetailView | null,
    loading: true,
    error: '',
    processing: false
  },

  timer: 0,
  loadingLock: false,
  accessReady: false,

  onLoad(query: any) {
    const id = Number(query && query.id) || 0;
    if (!id) {
      this.setData({ loading: false, error: '缺少订单编号' });
      return;
    }
    this.setData({ id });
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
    this.load(false).then(() => wx.stopPullDownRefresh());
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
    if (this.loadingLock) return;
    this.loadingLock = true;
    if (showLoading) this.setData({ loading: true, error: '' });
    try {
      const order = await fetchMerchantOrder(this.data.id);
      this.setData({ detail: toView(order), loading: false, error: '' });
    } catch (err: any) {
      if (showLoading || !this.data.detail) {
        this.setData({ loading: false, error: errorText(err) });
      }
    } finally {
      this.loadingLock = false;
    }
  },

  async start() {
    if (this.data.processing) return;
    this.setData({ processing: true });
    try {
      await startOrder(this.data.id);
      wx.showToast({ title: '已开始制作', icon: 'none' });
      await this.load(false);
    } catch (err: any) {
      toastError(err);
      this.load(false);
    } finally {
      this.setData({ processing: false });
    }
  },

  async complete() {
    if (this.data.processing) return;
    this.setData({ processing: true });
    try {
      await completeOrder(this.data.id);
      wx.showToast({ title: '已完成', icon: 'none' });
      await this.load(false);
    } catch (err: any) {
      toastError(err);
      this.load(false);
    } finally {
      this.setData({ processing: false });
    }
  },

  cancel() {
    wx.showModal({
      title: '取消这一单？',
      content: '客户会看到订单已取消，且不可恢复。',
      confirmText: '取消订单',
      confirmColor: '#A5483B',
      success: async (res: any) => {
        if (!res.confirm) return;
        try {
          await cancelMerchantOrder(this.data.id);
          wx.showToast({ title: '已取消', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 600);
        } catch (err: any) {
          toastError(err);
          this.load(false);
        }
      }
    });
  },

  backToBoard() {
    wx.reLaunch({ url: '/packageMerchant/board/index' });
  },

  reload() {
    this.load(true);
  }
});
