import {
  createIngredient,
  fetchMerchantIngredients,
  updateIngredient
} from '../../api/merchant';
import type { Ingredient } from '../../types/models';
import { errorText, toastError } from '../../utils/error';
import { guardManage, resolveUser } from '../../utils/role';

interface IngredientView extends Ingredient {
  glyph: string;
}

Page({
  data: {
    ingredients: [] as IngredientView[],
    total: 0,
    activeCount: 0,
    loading: true,
    error: '',
    busyId: 0,
    creating: false
  },

  accessReady: false,
  loadingLock: false,

  onLoad() {
    this.bootstrap();
  },

  async bootstrap() {
    try {
      const user = await resolveUser();
      if (!guardManage(user)) return;
      this.accessReady = true;
      this.load(true);
    } catch (err: any) {
      this.setData({ loading: false, error: errorText(err) });
    }
  },

  async onShow() {
    if (!this.accessReady) return;
    if (!(await this.ensureAccess())) return;
    this.load(false);
  },

  async onPullDownRefresh() {
    if (!(await this.ensureAccess())) {
      wx.stopPullDownRefresh();
      return;
    }
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  async ensureAccess(): Promise<boolean> {
    const app = getApp<IAppOption>();
    const user = await app.refreshUser();
    if (guardManage(user)) return true;
    this.accessReady = false;
    return false;
  },

  async load(showLoading: boolean): Promise<void> {
    if (this.loadingLock) return;
    this.loadingLock = true;
    if (showLoading) this.setData({ loading: true, error: '' });
    try {
      // 管理页需要看到已停用食材，才能重新启用
      const list = await fetchMerchantIngredients(true);
      const views: IngredientView[] = list.map((item) => ({
        ...item,
        glyph: Array.from(item.nameZh || '材')[0] || '材'
      }));
      this.setData({
        ingredients: views,
        total: views.length,
        activeCount: views.filter((item) => item.isActive).length,
        loading: false,
        error: ''
      });
    } catch (err: any) {
      if (showLoading || !this.data.ingredients.length) {
        this.setData({ loading: false, error: errorText(err) });
      }
    } finally {
      this.loadingLock = false;
    }
  },

  addIngredient() {
    if (this.data.creating) return;
    wx.showModal({
      title: '新增食材',
      editable: true,
      placeholderText: '例如：番茄 / 鸡蛋 / 小葱',
      confirmText: '创建',
      confirmColor: '#C0603C',
      success: async (res: any) => {
        if (!res.confirm) return;
        const nameZh = String(res.content || '').trim();
        if (!nameZh) {
          wx.showToast({ title: '请填写食材名称', icon: 'none' });
          return;
        }
        this.setData({ creating: true });
        try {
          await createIngredient({ nameZh });
          wx.showToast({ title: '食材已创建', icon: 'none' });
          await this.load(false);
        } catch (err: any) {
          toastError(err);
        } finally {
          this.setData({ creating: false });
        }
      }
    });
  },

  renameIngredient(e: any) {
    if (this.data.busyId) return;
    const id = Number(e.currentTarget.dataset.id);
    const item = this.data.ingredients.find((row) => row.id === id);
    if (!item) return;
    wx.showModal({
      title: '食材改名',
      editable: true,
      placeholderText: item.nameZh,
      confirmText: '保存',
      confirmColor: '#C0603C',
      success: async (res: any) => {
        if (!res.confirm) return;
        const nameZh = String(res.content || '').trim();
        if (!nameZh || nameZh === item.nameZh) return;
        this.setData({ busyId: id });
        try {
          await updateIngredient(id, { nameZh });
          wx.showToast({ title: '已改名', icon: 'none' });
          await this.load(false);
        } catch (err: any) {
          toastError(err);
        } finally {
          this.setData({ busyId: 0 });
        }
      }
    });
  },

  async toggleIngredient(e: any) {
    const id = Number(e.currentTarget.dataset.id);
    if (this.data.busyId) return;
    const item = this.data.ingredients.find((row) => row.id === id);
    if (!item) return;
    const next = !item.isActive;
    this.setData({
      busyId: id,
      ingredients: this.data.ingredients.map((row) =>
        row.id === id ? { ...row, isActive: next } : row
      ),
      activeCount: this.data.ingredients.filter((row) =>
        row.id === id ? next : row.isActive
      ).length
    });
    try {
      await updateIngredient(id, { isActive: next });
      wx.showToast({ title: next ? '食材已启用' : '食材已停用', icon: 'none' });
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
