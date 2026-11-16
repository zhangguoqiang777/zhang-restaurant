import {
  createCategory,
  fetchMerchantCategories,
  fetchMerchantDishes,
  updateCategory,
  updateDish
} from '../../api/merchant';
import type { Category, Dish } from '../../types/models';
import { errorText, toastError } from '../../utils/error';
import { guardManage, resolveUser } from '../../utils/role';

interface DishView extends Dish {
  summary: string;
}

interface CategoryView extends Category {
  dishCount: number;
}

type Filter = 'all' | 'on' | 'off';

function toView(dish: Dish): DishView {
  const parts: string[] = [];
  parts.push(dish.categoryName || '未分类');
  parts.push(`${dish.ingredientCount} 种食材`);
  if (dish.ratingCount > 0) parts.push(`${dish.ratingCount} 条评价`);
  if (!dish.ingredientCount) parts.push('未配置配方');
  return { ...dish, summary: parts.join(' · ') };
}

Page({
  data: {
    keyword: '',
    filter: 'all' as Filter,
    dishes: [] as DishView[],
    counts: { all: 0, on: 0, off: 0 },
    categories: [] as CategoryView[],
    categoryOpen: false,
    loading: true,
    error: '',
    togglingId: 0,
    categoryBusy: false
  },

  allDishes: [] as DishView[],
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
      const [categories, dishes] = await Promise.all([fetchMerchantCategories(), fetchMerchantDishes()]);
      const views = dishes.map(toView);
      const counts = {
        all: views.length,
        on: views.filter((item) => item.isAvailable).length,
        off: views.filter((item) => !item.isAvailable).length
      };
      const categoryViews: CategoryView[] = categories
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map((item) => ({
          ...item,
          dishCount: views.filter((dish) => dish.categoryId === item.id).length
        }));
      this.allDishes = views;
      this.setData({ categories: categoryViews, counts, loading: false, error: '' });
      this.applyFilter();
    } catch (err: any) {
      if (showLoading || !this.allDishes.length) {
        this.setData({ loading: false, error: errorText(err) });
      }
    } finally {
      this.loadingLock = false;
    }
  },

  applyFilter() {
    const keyword = this.data.keyword.trim().toLowerCase();
    const filter = this.data.filter;
    const dishes = this.allDishes.filter((dish) => {
      if (filter === 'on' && !dish.isAvailable) return false;
      if (filter === 'off' && dish.isAvailable) return false;
      if (!keyword) return true;
      return dish.nameZh.toLowerCase().indexOf(keyword) >= 0;
    });
    this.setData({ dishes });
  },

  onKeyword(e: any) {
    this.setData({ keyword: e.detail.value || '' });
    this.applyFilter();
  },

  clearKeyword() {
    this.setData({ keyword: '' });
    this.applyFilter();
  },

  setFilter(e: any) {
    const filter = e.currentTarget.dataset.filter as Filter;
    if (filter === this.data.filter) return;
    this.setData({ filter });
    this.applyFilter();
  },

  toggleCategoryPanel() {
    this.setData({ categoryOpen: !this.data.categoryOpen });
  },

  async toggleDish(e: any) {
    const id = Number(e.currentTarget.dataset.id);
    const dish = this.allDishes.find((item) => item.id === id);
    if (!dish || this.data.togglingId) return;
    const next = !dish.isAvailable;
    this.setData({ togglingId: id });
    this.allDishes = this.allDishes.map((item) => (item.id === id ? { ...item, isAvailable: next } : item));
    this.setData({
      counts: {
        all: this.allDishes.length,
        on: this.allDishes.filter((item) => item.isAvailable).length,
        off: this.allDishes.filter((item) => !item.isAvailable).length
      }
    });
    this.applyFilter();
    try {
      await updateDish(id, { isAvailable: next });
      wx.showToast({ title: next ? '已上架' : '已下架', icon: 'none' });
    } catch (err: any) {
      toastError(err);
      await this.load(false);
    } finally {
      this.setData({ togglingId: 0 });
    }
  },

  goEdit(e: any) {
    const id = e.currentTarget && e.currentTarget.dataset.id;
    const url = id ? `/packageMerchant/dish-edit/index?id=${id}` : '/packageMerchant/dish-edit/index';
    wx.navigateTo({ url });
  },

  goIngredients() {
    wx.navigateTo({ url: '/packageMerchant/ingredients/index' });
  },

  addCategory() {
    if (this.data.categoryBusy) return;
    wx.showModal({
      title: '新增分类',
      editable: true,
      placeholderText: '例如：热菜 / 主食 / 汤品',
      confirmText: '创建',
      confirmColor: '#C0603C',
      success: async (res: any) => {
        if (!res.confirm) return;
        const nameZh = String(res.content || '').trim();
        if (!nameZh) {
          wx.showToast({ title: '请填写分类名称', icon: 'none' });
          return;
        }
        const sortOrder =
          this.data.categories.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
        this.setData({ categoryBusy: true });
        try {
          await createCategory({ nameZh, sortOrder });
          wx.showToast({ title: '分类已创建', icon: 'none' });
          await this.load(false);
        } catch (err: any) {
          toastError(err);
        } finally {
          this.setData({ categoryBusy: false });
        }
      }
    });
  },

  renameCategory(e: any) {
    if (this.data.categoryBusy) return;
    const id = Number(e.currentTarget.dataset.id);
    const category = this.data.categories.find((item) => item.id === id);
    if (!category) return;
    wx.showModal({
      title: '分类改名',
      editable: true,
      placeholderText: category.nameZh,
      confirmText: '保存',
      confirmColor: '#C0603C',
      success: async (res: any) => {
        if (!res.confirm) return;
        const nameZh = String(res.content || '').trim();
        if (!nameZh || nameZh === category.nameZh) return;
        this.setData({ categoryBusy: true });
        try {
          await updateCategory(id, { nameZh });
          wx.showToast({ title: '已改名', icon: 'none' });
          await this.load(false);
        } catch (err: any) {
          toastError(err);
        } finally {
          this.setData({ categoryBusy: false });
        }
      }
    });
  },

  async toggleCategory(e: any) {
    if (this.data.categoryBusy) return;
    const id = Number(e.currentTarget.dataset.id);
    const category = this.data.categories.find((item) => item.id === id);
    if (!category) return;
    const next = !category.isActive;
    this.setData({
      categoryBusy: true,
      categories: this.data.categories.map((item) =>
        item.id === id ? { ...item, isActive: next } : item
      )
    });
    try {
      await updateCategory(id, { isActive: next });
      wx.showToast({ title: next ? '分类已启用' : '分类已停用', icon: 'none' });
      await this.load(false);
    } catch (err: any) {
      toastError(err);
      await this.load(false);
    } finally {
      this.setData({ categoryBusy: false });
    }
  },

  async moveCategory(e: any) {
    if (this.data.categoryBusy) return;
    const id = Number(e.currentTarget.dataset.id);
    const delta = Number(e.currentTarget.dataset.delta);
    const list = this.data.categories.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const index = list.findIndex((item) => item.id === id);
    const targetIndex = index + delta;
    if (index < 0 || targetIndex < 0 || targetIndex >= list.length) return;

    const swapped = list.slice();
    const temp = swapped[index];
    swapped[index] = swapped[targetIndex];
    swapped[targetIndex] = temp;

    this.setData({ categoryBusy: true });
    try {
      for (let i = 0; i < swapped.length; i += 1) {
        const nextOrder = i + 1;
        if (swapped[i].sortOrder !== nextOrder) {
          await updateCategory(swapped[i].id, { sortOrder: nextOrder });
        }
      }
      await this.load(false);
    } catch (err: any) {
      toastError(err);
      await this.load(false);
    } finally {
      this.setData({ categoryBusy: false });
    }
  },

  retry() {
    this.load(true);
  }
});
