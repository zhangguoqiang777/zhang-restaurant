import {
  createDish,
  createIngredient,
  fetchMerchantCategories,
  fetchMerchantDishes,
  fetchMerchantIngredients,
  updateDish
} from '../../api/merchant';
import { uploadDishImage } from '../../api/upload';
import type { Category, Dish, Ingredient } from '../../types/models';
import { errorText, toastError } from '../../utils/error';
import { guardRole } from '../../utils/role';

interface IngredientView extends Ingredient {
  selected: boolean;
}

const INTRO_LIMIT = 120;

Page({
  data: {
    dishId: 0,
    isEdit: false,
    title: '新增菜品',
    name: '',
    categoryId: 0,
    intro: '',
    introLen: 0,
    introLimit: INTRO_LIMIT,
    imageKey: '',
    isAvailable: true,
    categories: [] as Category[],
    ingredients: [] as IngredientView[],
    selectedCount: 0,
    loading: true,
    error: '',
    uploading: false,
    submitting: false
  },

  accessReady: false,

  onLoad(query: any) {
    const id = Number(query && query.id);
    this.setData({ dishId: id, isEdit: id > 0, title: id > 0 ? '编辑菜品' : '新增菜品' });
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
    await this.loadForm();
  },

  async loadForm() {
    this.setData({ loading: true, error: '' });
    try {
      const [categories, ingredients] = await Promise.all([
        fetchMerchantCategories(),
        fetchMerchantIngredients()
      ]);
      let dish: Dish | null = null;
      if (this.data.dishId) {
        const dishes = await fetchMerchantDishes();
        dish = dishes.find((item) => item.id === this.data.dishId) || null;
        if (!dish) {
          this.setData({ loading: false, error: '菜品不存在或已被删除' });
          return;
        }
      }

      const selectedIds = dish ? dish.ingredientIds.slice() : [];
      const views = this.buildIngredients(ingredients, dish, selectedIds);

      this.setData({
        categories,
        ingredients: views,
        selectedCount: selectedIds.length,
        loading: false,
        error: ''
      });

      if (dish) {
        this.setData({
          name: dish.nameZh,
          categoryId: dish.categoryId,
          intro: dish.introZh,
          introLen: dish.introZh.length,
          imageKey: dish.imageKey,
          isAvailable: dish.isAvailable
        });
      } else if (categories.length) {
        this.setData({ categoryId: categories[0].id });
      }
    } catch (err: any) {
      this.setData({ loading: false, error: errorText(err) });
    }
  },

  /** 编辑时把菜里用到但已被停用的食材也展示出来，避免保存时丢失配方 */
  buildIngredients(list: Ingredient[], dish: Dish | null, selectedIds: number[]): IngredientView[] {
    const map: Record<number, Ingredient> = {};
    list.forEach((item) => {
      map[item.id] = item;
    });
    if (dish) {
      (dish.ingredients || []).forEach((item) => {
        if (!map[item.id]) map[item.id] = item;
      });
    }
    return Object.keys(map)
      .map((key) => map[Number(key)])
      .filter((item) => item.isActive || selectedIds.indexOf(item.id) >= 0)
      .map((item) => ({ ...item, selected: selectedIds.indexOf(item.id) >= 0 }));
  },

  onName(e: any) {
    this.setData({ name: e.detail.value || '' });
  },

  onIntro(e: any) {
    const intro = e.detail.value || '';
    this.setData({ intro, introLen: intro.length });
  },

  pickCategory(e: any) {
    this.setData({ categoryId: Number(e.currentTarget.dataset.id) });
  },

  toggleIngredient(e: any) {
    const id = Number(e.currentTarget.dataset.id);
    const ingredients = this.data.ingredients.map((item) =>
      item.id === id ? { ...item, selected: !item.selected } : item
    );
    this.setData({
      ingredients,
      selectedCount: ingredients.filter((item) => item.selected).length
    });
  },

  addIngredient() {
    wx.showModal({
      title: '新建食材',
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
        wx.showLoading({ title: '创建中' });
        try {
          const created = await createIngredient({ nameZh });
          const list = await fetchMerchantIngredients();
          const selectedIds = this.data.ingredients
            .filter((item) => item.selected)
            .map((item) => item.id);
          selectedIds.push(created.id);
          const views = list
            .filter((item) => item.isActive || selectedIds.indexOf(item.id) >= 0)
            .map((item) => ({ ...item, selected: selectedIds.indexOf(item.id) >= 0 }));
          this.setData({
            ingredients: views,
            selectedCount: selectedIds.length
          });
          wx.hideLoading();
          wx.showToast({ title: '已创建并选中', icon: 'none' });
        } catch (err: any) {
          wx.hideLoading();
          toastError(err);
        }
      }
    });
  },

  chooseImage() {
    if (this.data.uploading) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res: any) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        this.setData({ uploading: true });
        try {
          const result = await uploadDishImage(file.tempFilePath);
          this.setData({ imageKey: result.imageKey });
          wx.showToast({ title: '图片已上传', icon: 'none' });
        } catch (err: any) {
          toastError(err);
        } finally {
          this.setData({ uploading: false });
        }
      }
    });
  },

  removeImage() {
    this.setData({ imageKey: '' });
  },

  toggleAvailable() {
    this.setData({ isAvailable: !this.data.isAvailable });
  },

  async save() {
    if (this.data.submitting) return;
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: '请填写菜品名称', icon: 'none' });
      return;
    }
    if (!this.data.categoryId) {
      wx.showToast({ title: '请选择分类', icon: 'none' });
      return;
    }
    const selectedIds = this.data.ingredients.filter((item) => item.selected).map((item) => item.id);
    if (!selectedIds.length) {
      const confirmed = await this.confirmNoIngredients();
      if (!confirmed) return;
    }
    this.setData({ submitting: true });
    const payload = {
      nameZh: name,
      categoryId: this.data.categoryId,
      introZh: this.data.intro.trim(),
      imageKey: this.data.imageKey,
      isAvailable: this.data.isAvailable,
      ingredientIds: selectedIds
    };
    try {
      if (this.data.isEdit) {
        await updateDish(this.data.dishId, payload);
      } else {
        await createDish(payload);
      }
      wx.showToast({ title: this.data.isEdit ? '已保存' : '菜品已创建', icon: 'success', duration: 900 });
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) {
          wx.navigateBack();
        } else {
          wx.reLaunch({ url: '/packageMerchant/dishes/index' });
        }
      }, 700);
    } catch (err: any) {
      this.setData({ submitting: false });
      toastError(err);
    }
  },

  confirmNoIngredients(): Promise<boolean> {
    return new Promise((resolve) => {
      wx.showModal({
        title: '还没有配置食材',
        content: '未配置配方的菜品不会进入采购清单，仍要保存吗？',
        confirmText: '仍要保存',
        confirmColor: '#C0603C',
        success: (res: any) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });
  },

  retry() {
    this.loadForm();
  }
});
