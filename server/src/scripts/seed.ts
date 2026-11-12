import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { closeDb, getDb } from '../db';
import { ensureUtf8Console } from '../lib/console-utf8';

ensureUtf8Console();

interface SeedDish {
  name: string;
  category: string;
  intro: string;
  imageKey: string;
  svg: string;
  ingredients: string[];
}

const plate = (inner: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
<rect width="240" height="240" fill="#F1DFCD"/>
<circle cx="182" cy="46" r="54" fill="#EAD2BA" opacity=".55"/>
<circle cx="120" cy="128" r="90" fill="#FCF6EB"/>
<circle cx="120" cy="128" r="70" fill="#E8C9A8"/>
${inner}
</svg>`;

const dishes: SeedDish[] = [
  {
    name: '番茄鸡蛋面',
    category: '招牌',
    intro: '手擀面配沙瓤番茄，微酸开胃',
    imageKey: 'seed/tomato-noodle.svg',
    ingredients: ['番茄', '鸡蛋', '面条', '小葱'],
    svg: plate(`
<path d="M44 118h152c0 42-34 68-76 68s-76-26-76-68z" fill="#F7E6D3"/>
<path d="M58 118h124" stroke="#D9B68F" stroke-width="4" fill="none"/>
<path d="M70 110c16-16 30 14 46-4s28 10 42-6" fill="none" stroke="#FBDFA9" stroke-width="9" stroke-linecap="round"/>
<path d="M74 128c18-14 32 12 48-4s28 10 40-4" fill="none" stroke="#F6D69B" stroke-width="7" stroke-linecap="round"/>
<circle cx="90" cy="102" r="14" fill="#D9603D"/><circle cx="85" cy="97" r="4" fill="#EC9477"/>
<circle cx="152" cy="110" r="12" fill="#D9603D"/>
<path d="M132 98c8-6 18-6 24 2-2 8-12 10-18 6z" fill="#F2CB63"/>
<path d="M66 140c6 6 12 10 20 12M148 146c8-2 14-6 18-12" stroke="#6B8D57" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M100 74c-4-8 2-14 8-18M124 70c-2-8 4-14 10-18" stroke="#E9D7C4" stroke-width="4" opacity=".7" fill="none" stroke-linecap="round"/>`),
  },
  {
    name: '宫保鸡丁',
    category: '热菜',
    intro: '鸡腿肉配花生与干辣椒，咸甜微辣',
    imageKey: 'seed/kungpao-chicken.svg',
    ingredients: ['鸡腿肉', '花生', '干辣椒', '小葱'],
    svg: plate(`
<ellipse cx="120" cy="132" rx="74" ry="58" fill="#F3DCC0"/>
${[
  { x: 80, y: 108, r: 15, fill: '#B4672F' },
  { x: 112, y: 96, r: 14, fill: '#C4763A' },
  { x: 146, y: 108, r: 15, fill: '#A95F2A' },
  { x: 96, y: 136, r: 14, fill: '#BE7034' },
  { x: 130, y: 138, r: 15, fill: '#AE6329' },
  { x: 160, y: 136, r: 12, fill: '#B86B31' },
]
  .map((b) => `<rect x="${b.x - b.r}" y="${b.y - b.r}" width="${b.r * 2}" height="${b.r * 2}" rx="7" fill="${b.fill}"/>`)
  .join('\n')}
<g fill="#E4B96A">
  <ellipse cx="92" cy="118" rx="6" ry="4.5"/><ellipse cx="124" cy="112" rx="6" ry="4.5"/>
  <ellipse cx="148" cy="126" rx="6" ry="4.5"/><ellipse cx="112" cy="146" rx="6" ry="4.5"/>
  <ellipse cx="78" cy="140" rx="6" ry="4.5"/><ellipse cx="140" cy="152" rx="6" ry="4.5"/>
</g>
<path d="M88 88c10-4 20-4 28 2" stroke="#A5483B" stroke-width="7" stroke-linecap="round" fill="none"/>
<path d="M150 92c8 0 14 4 18 10" stroke="#A5483B" stroke-width="7" stroke-linecap="round" fill="none"/>
<path d="M70 156c8 4 16 6 24 8M156 154c-6 6-12 10-18 12" stroke="#5F8A4A" stroke-width="5" fill="none" stroke-linecap="round"/>`),
  },
  {
    name: '蒜蓉时蔬',
    category: '热菜',
    intro: '当季青菜清炒，蒜香提味',
    imageKey: 'seed/garlic-greens.svg',
    ingredients: ['青菜', '蒜', '小葱'],
    svg: plate(`
<path d="M58 156c-6-34 12-66 44-74 6 22-2 50-18 66z" fill="#5E8C4A"/>
<path d="M86 158c-2-40 18-70 52-78 4 26-8 56-28 72z" fill="#6E9E56"/>
<path d="M112 158c4-34 24-56 54-60 0 24-16 48-36 60z" fill="#7CAB60"/>
<path d="M70 132c8-10 16-18 26-24M96 138c8-14 18-24 30-30M124 140c10-10 20-16 30-18" stroke="#A8C98A" stroke-width="3.5" fill="none" stroke-linecap="round"/>
<g fill="#F3EAD6">
  <ellipse cx="72" cy="152" rx="7" ry="5"/><ellipse cx="104" cy="160" rx="7" ry="5"/>
  <ellipse cx="140" cy="152" rx="7" ry="5"/><ellipse cx="162" cy="138" rx="6" ry="4.5"/>
</g>
<circle cx="120" cy="100" r="6" fill="#D9603D" opacity=".9"/>`),
  },
  {
    name: '番茄炒蛋',
    category: '热菜',
    intro: '番茄炒出沙，鸡蛋嫩滑，家常口味',
    imageKey: 'seed/tomato-egg.svg',
    ingredients: ['番茄', '鸡蛋', '小葱'],
    svg: plate(`
<ellipse cx="120" cy="130" rx="76" ry="60" fill="#F6E3CC"/>
<path d="M66 116c10-22 34-30 52-16-4 22-26 34-46 28z" fill="#F1C453"/>
<path d="M112 150c-16 2-30-6-32-20 14-14 38-14 50 2-2 12-8 16-18 18z" fill="#F5CE6B"/>
<path d="M136 100c14-6 30 0 34 14-8 12-26 16-38 6z" fill="#EFC14E"/>
<circle cx="92" cy="120" r="16" fill="#D9603D"/><circle cx="86" cy="114" r="5" fill="#EC9477"/>
<circle cx="146" cy="132" r="15" fill="#CF5535"/><circle cx="141" cy="126" r="4.5" fill="#EC9477"/>
<circle cx="118" cy="96" r="12" fill="#D9603D"/>
<path d="M78 158c12 4 24 6 36 6M150 156c-10 6-20 10-30 10" stroke="#5F8A4A" stroke-width="5" fill="none" stroke-linecap="round"/>`),
  },
  {
    name: '米饭',
    category: '主食',
    intro: '当日新米，软硬适中',
    imageKey: 'seed/steamed-rice.svg',
    ingredients: ['大米'],
    svg: plate(`
<path d="M52 126h136c0 44-30 70-68 70s-68-26-68-70z" fill="#F7E6D3"/>
<path d="M58 126h124" stroke="#D9B68F" stroke-width="4" fill="none"/>
<path d="M78 122c0-30 18-50 42-50s42 20 42 50z" fill="#FFFDF8"/>
<path d="M84 116c4-22 18-34 36-34s32 12 36 34" fill="none" stroke="#EFE3D2" stroke-width="4"/>
<g fill="#F4EADF">
  <ellipse cx="100" cy="104" rx="9" ry="5" transform="rotate(-16 100 104)"/>
  <ellipse cx="126" cy="96" rx="9" ry="5" transform="rotate(10 126 96)"/>
  <ellipse cx="144" cy="110" rx="8" ry="4.5" transform="rotate(-8 144 110)"/>
  <ellipse cx="112" cy="86" rx="8" ry="4.5" transform="rotate(18 112 86)"/>
</g>`),
  },
  {
    name: '紫菜蛋花汤',
    category: '汤品',
    intro: '清淡收尾，紫菜与蛋花',
    imageKey: 'seed/seaweed-soup.svg',
    ingredients: ['紫菜', '鸡蛋', '小葱'],
    svg: plate(`
<path d="M50 120h140c0 46-32 72-70 72s-70-26-70-72z" fill="#E3D3BE"/>
<ellipse cx="120" cy="120" rx="70" ry="26" fill="#C9A46E"/>
<ellipse cx="120" cy="120" rx="58" ry="19" fill="#DDBE8E"/>
<path d="M74 118c14-8 26 8 40 0s26 8 38 0" stroke="#8A6A3F" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/>
<path d="M96 112c8-6 14 2 22-4M132 124c8-4 14 2 22-2" stroke="#F7E9CF" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M86 126c8 2 14 4 20 8M146 124c-6 4-12 8-16 12" stroke="#5F8A4A" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M108 72c-4-8 4-14 10-18M132 68c-2-8 4-12 10-16" stroke="#E9D7C4" stroke-width="4" opacity=".7" fill="none" stroke-linecap="round"/>`),
  },
];

const categories: { name: string; sort: number }[] = [
  { name: '招牌', sort: 10 },
  { name: '热菜', sort: 20 },
  { name: '主食', sort: 30 },
  { name: '汤品', sort: 40 },
];

const ingredientNames = ['番茄', '鸡蛋', '面条', '小葱', '青菜', '鸡腿肉', '花生', '大米', '紫菜', '干辣椒', '蒜'];

function ensureCategory(db: ReturnType<typeof getDb>, name: string, sort: number): number {
  const found = db.prepare('SELECT id FROM dish_category WHERE name_zh = ?').get(name) as { id: number } | undefined;
  if (found) return found.id;
  const info = db
    .prepare('INSERT INTO dish_category (name_zh, sort_order, is_active) VALUES (?, ?, 1)')
    .run(name, sort);
  return Number(info.lastInsertRowid);
}

function ensureIngredient(db: ReturnType<typeof getDb>, name: string): number {
  const found = db.prepare('SELECT id FROM ingredient WHERE name_zh = ?').get(name) as { id: number } | undefined;
  if (found) return found.id;
  const info = db.prepare('INSERT INTO ingredient (name_zh, is_active) VALUES (?, 1)').run(name);
  return Number(info.lastInsertRowid);
}

function main(): void {
  const db = getDb();

  const seed = db.transaction(() => {
    const categoryIds = new Map<string, number>();
    categories.forEach((c) => categoryIds.set(c.name, ensureCategory(db, c.name, c.sort)));

    const ingredientIds = new Map<string, number>();
    ingredientNames.forEach((name) => ingredientIds.set(name, ensureIngredient(db, name)));

    let created = 0;
    for (const dish of dishes) {
      const imagePath = path.join(config.uploadDir, dish.imageKey);
      fs.mkdirSync(path.dirname(imagePath), { recursive: true });
      if (!fs.existsSync(imagePath)) fs.writeFileSync(imagePath, dish.svg, 'utf8');

      const existing = db.prepare('SELECT id FROM dish WHERE name_zh = ?').get(dish.name) as
        | { id: number }
        | undefined;
      if (existing) continue;

      const categoryId = categoryIds.get(dish.category);
      if (!categoryId) throw new Error(`缺少分类：${dish.category}`);

      const info = db
        .prepare(
          `INSERT INTO dish (category_id, name_zh, intro_zh, image_key, is_available, sort_order)
           VALUES (?, ?, ?, ?, 1, ?)`,
        )
        .run(categoryId, dish.name, dish.intro, dish.imageKey, sortOrderOf(dish.name));

      const dishId = Number(info.lastInsertRowid);
      for (const name of dish.ingredients) {
        const ingredientId = ingredientIds.get(name);
        if (!ingredientId) throw new Error(`缺少食材：${name}`);
        db.prepare('INSERT OR IGNORE INTO dish_ingredient (dish_id, ingredient_id) VALUES (?, ?)').run(
          dishId,
          ingredientId,
        );
      }
      created += 1;
    }

    return { created };
  });

  const { created } = seed();
  const counts = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM dish_category) AS categories,
              (SELECT COUNT(*) FROM dish) AS dishes,
              (SELECT COUNT(*) FROM ingredient) AS ingredients`,
    )
    .get() as { categories: number; dishes: number; ingredients: number };

  console.log(`初始化数据完成：新增菜品 ${created} 道`);
  console.log(`当前数据：分类 ${counts.categories} 个 / 菜品 ${counts.dishes} 道 / 食材 ${counts.ingredients} 种`);
  console.log(`示例图片目录：${path.join(config.uploadDir, 'seed')}`);

  closeDb();
}

function sortOrderOf(name: string): number {
  const index = dishes.findIndex((d) => d.name === name);
  return (index + 1) * 10;
}

main();
