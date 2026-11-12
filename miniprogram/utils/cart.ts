import type { CartItem, Dish } from '../types/models';
import { str } from './normalize';

const CART_KEY = 'zhang_cart';

export function loadCart(): CartItem[] {
  const raw = wx.getStorageSync(CART_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item: any) => item && item.dishId)
    .map((item: any) => ({
      dishId: Number(item.dishId),
      nameZh: str(item.nameZh),
      introZh: str(item.introZh),
      imageKey: str(item.imageKey),
      qty: Math.max(1, Number(item.qty) || 1)
    }));
}

export function saveCart(items: CartItem[]) {
  wx.setStorageSync(CART_KEY, items);
}

export function addToCart(dish: Dish, qty = 1): CartItem[] {
  const items = loadCart();
  const existing = items.find((item) => item.dishId === dish.id);
  if (existing) {
    existing.qty += qty;
  } else {
    items.push({
      dishId: dish.id,
      nameZh: dish.nameZh,
      introZh: dish.introZh,
      imageKey: dish.imageKey,
      qty
    });
  }
  saveCart(items);
  return items;
}

export function updateQty(dishId: number, qty: number): CartItem[] {
  let items = loadCart();
  if (qty <= 0) {
    items = items.filter((item) => item.dishId !== dishId);
  } else {
    const target = items.find((item) => item.dishId === dishId);
    if (target) target.qty = qty;
  }
  saveCart(items);
  return items;
}

export function clearCart() {
  wx.removeStorageSync(CART_KEY);
}

export function cartCount(items: CartItem[] = loadCart()): number {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

export function cartKinds(items: CartItem[] = loadCart()): number {
  return items.length;
}
