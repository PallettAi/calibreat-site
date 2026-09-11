import cofidBundle from '@/data/cofid-foods.json';

import type { CofidFood } from '@/lib/food-search';

export const COFID_FOODS: CofidFood[] = (cofidBundle as { foods: CofidFood[] }).foods;
