import type { Category, Dish, DishRating, DishReview } from '../types/models';
import {
  extractList,
  normalizeCategory,
  normalizeDish,
  normalizeDishRating,
  normalizeDishReview
} from '../utils/normalize';
import { request, withQuery } from './request';

export function fetchCategories(): Promise<Category[]> {
  return request<any>({ url: '/categories' }).then((data) =>
    extractList(data && data.categories ? data.categories : data).map(normalizeCategory)
  );
}

export function fetchDishes(categoryId?: number): Promise<Dish[]> {
  const url = withQuery('/dishes', { categoryId });
  return request<any>({ url }).then((data) => extractList(data && data.dishes ? data.dishes : data).map(normalizeDish));
}

export function fetchDish(id: number): Promise<{ dish: Dish; rating: DishRating }> {
  return request<any>({ url: `/dishes/${id}` }).then((raw) => {
    const source = raw && raw.dish ? raw.dish : raw || {};
    const dish = normalizeDish(source);
    const ratingSource =
      (raw && raw.rating) ||
      (raw && raw.ratings) ||
      (source && source.rating) || {
        avg: source.ratingAvg,
        count: source.ratingCount
      };
    const rating = normalizeDishRating(ratingSource);
    if (!rating.avg && dish.ratingAvg) rating.avg = dish.ratingAvg;
    if (!rating.count && dish.ratingCount) rating.count = dish.ratingCount;
    return { dish, rating };
  });
}

export function fetchDishReviews(id: number): Promise<DishReview[]> {
  return request<any>({ url: `/dishes/${id}/reviews` }).then((data) =>
    extractList(data && data.reviews ? data.reviews : data).map(normalizeDishReview)
  );
}
