import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { UserContext } from "../../foodvisor/client.js";
import {
  getFoodDetails,
  getUserMe,
  listMeals,
  upsertMeals,
} from "../../foodvisor/endpoints.js";
import {
  FoodInfo,
  MacroMeal,
  MealSubFood,
  MealType,
} from "../../foodvisor/types.js";

const mealTypeSchema = z.enum([
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "custom_1",
  "custom_2",
  "custom_3",
  "custom_4",
  "custom_5",
]);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const foodEntrySchema = z.object({
  food_id: z
    .string()
    .min(1)
    .describe("food_id returned by search_food"),
  quantity_g: z
    .number()
    .positive()
    .describe(
      "Total grams to log. Use `default_grams` from search_food as a sensible default when the user doesn't specify a quantity.",
    ),
});

export function registerMealTools(server: McpServer, ctx: UserContext): void {
  server.registerTool(
    "log_meal",
    {
      title: "Log a meal in Foodvisor",
      description:
        "Add foods to a meal slot (breakfast/lunch/dinner/snack/custom_*) on a given date. Foods must reference food_ids resolved via search_food. Existing entries on the same date+meal_type are preserved: this tool fetches them first and re-sends them alongside the new ones (Foodvisor's POST /meal otherwise overwrites the slot).",
      inputSchema: {
        meal_date: dateSchema.describe("Date of the meal, YYYY-MM-DD"),
        meal_type: mealTypeSchema,
        foods: z.array(foodEntrySchema).min(1).max(50),
      },
    },
    async ({ meal_date, meal_type, foods }) => {
      const now = new Date().toISOString();
      const newEntries: MealSubFood[] = foods.map((f) => ({
        local_id: randomUUID().toUpperCase(),
        created_at: now,
        modified_at: now,
        serving_amount: 1,
        main_food: {
          food_id: f.food_id,
          quantity: f.quantity_g,
          unit_id: "unit_g",
        },
      }));

      const existing = await listMeals(ctx, { from: meal_date, to: meal_date });
      const existingSlot = existing.macro_meals.find(
        (m) => m.meal_date === meal_date && m.meal_type === meal_type,
      );
      const sub_foods: MealSubFood[] = [
        ...(existingSlot?.sub_foods ?? []),
        ...newEntries,
      ];

      const res = await upsertMeals(ctx, {
        macro_meals: [{ meal_date, meal_type, sub_foods }],
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: true,
                meal_date,
                meal_type,
                added_count: foods.length,
                preserved_existing_count: existingSlot?.sub_foods.length ?? 0,
                modified_at: res.modified_at,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_meals",
    {
      title: "List logged meals (enriched)",
      description:
        "Return logged meals on a date range, with each entry already resolved to its display name, grams, calories and macros. No need to call get_food_details afterwards. Pass only `from` (and omit `to`) for a single-day query. Entries with unreliable nutrition values are flagged via `data_quality_warning`.",
      inputSchema: {
        from: dateSchema,
        to: dateSchema
          .nullish()
          .describe("Optional end date YYYY-MM-DD; defaults to `from`"),
      },
    },
    async ({ from, to }) => {
      const range = { from, to: to ?? from };
      const meals = await listMeals(ctx, range);
      const allFoodIds = new Set<string>();
      for (const m of meals.macro_meals) {
        const flat: FlatEntry[] = [];
        flattenSubFoods(m.sub_foods, m.meal_type, flat);
        for (const e of flat) allFoodIds.add(e.food_id);
      }
      const foods =
        allFoodIds.size > 0
          ? await getFoodDetails(ctx, [...allFoodIds])
          : { food_info: [] };
      const byFood = new Map(foods.food_info.map((f) => [f.food_id, f]));

      const enriched = meals.macro_meals.map((m) => {
        const flat: FlatEntry[] = [];
        flattenSubFoods(m.sub_foods, m.meal_type, flat);
        const items = flat.map((e) => describeEntry(e, byFood.get(e.food_id)));
        return {
          meal_date: m.meal_date,
          meal_type: m.meal_type,
          items,
          totals: computeTotals(flat, byFood),
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                range,
                meals: enriched,
                missing_food_details: [...allFoodIds].filter(
                  (id) => !byFood.has(id),
                ),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_daily_summary",
    {
      title: "Aggregate calories and macros for one day",
      description:
        "Compute total calories, proteins, lipids, carbs and fibers consumed on a given date by summing every logged sub_food. Includes the user's daily targets so the LLM can compute remaining budget.",
      inputSchema: {
        date: dateSchema.describe("Date YYYY-MM-DD"),
      },
    },
    async ({ date }) => {
      const [meals, profile] = await Promise.all([
        listMeals(ctx, { from: date, to: date }),
        getUserMe(ctx),
      ]);

      const summary = aggregateDay(meals.macro_meals, date);
      const foods =
        summary.foodIds.length > 0
          ? await getFoodDetails(ctx, summary.foodIds)
          : { food_info: [] };
      const byFood = new Map(foods.food_info.map((f) => [f.food_id, f]));

      const totals = computeTotals(summary.entries, byFood);
      const perMeal = summary.byMealType.map(({ meal_type, entries }) => ({
        meal_type,
        ...computeTotals(entries, byFood),
      }));

      const suspect: Array<{ food_id: string; display_name: string; warning: string }> = [];
      for (const id of summary.foodIds) {
        const food = byFood.get(id);
        if (!food) continue;
        const w = dataQualityWarning(food);
        if (w) suspect.push({ food_id: id, display_name: food.display_name, warning: w });
      }

      const targets = {
        calories: profile.max_calories,
        proteins_g: round(profile.max_proteins / KCAL_PER_G.proteins),
        lipids_g: round(profile.max_lipids / KCAL_PER_G.lipids),
        carbs_g: round(profile.max_carbs / KCAL_PER_G.carbs),
        fibers_g: round(profile.max_fibers / KCAL_PER_G.fibers),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                date,
                total: totals,
                per_meal_type: perMeal,
                targets,
                remaining: {
                  calories: round(targets.calories - totals.calories),
                  proteins_g: round(targets.proteins_g - totals.proteins_g),
                  lipids_g: round(targets.lipids_g - totals.lipids_g),
                  carbs_g: round(targets.carbs_g - totals.carbs_g),
                  fibers_g: round(targets.fibers_g - totals.fibers_g),
                },
                items_logged: totals.items,
                missing_food_details: summary.foodIds.filter(
                  (id) => !byFood.has(id),
                ),
                ...(suspect.length > 0
                  ? { suspect_data: suspect }
                  : {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}

interface FlatEntry {
  food_id: string;
  unit_id: string;
  quantity: number;
  serving_amount: number;
  meal_type: MealType;
}

function flattenSubFoods(
  subs: MealSubFood[],
  meal_type: MealType,
  out: FlatEntry[],
): void {
  for (const sf of subs) {
    if (sf.main_food) {
      out.push({
        food_id: sf.main_food.food_id,
        unit_id: sf.main_food.unit_id,
        quantity: sf.main_food.quantity,
        serving_amount: sf.serving_amount,
        meal_type,
      });
    }
    if (sf.sub_foods?.length) flattenSubFoods(sf.sub_foods, meal_type, out);
  }
}

function aggregateDay(
  meals: MacroMeal[],
  date: string,
): {
  entries: FlatEntry[];
  foodIds: string[];
  byMealType: Array<{ meal_type: MealType; entries: FlatEntry[] }>;
} {
  const entries: FlatEntry[] = [];
  const byType = new Map<MealType, FlatEntry[]>();
  for (const m of meals) {
    if (m.meal_date !== date) continue;
    const flat: FlatEntry[] = [];
    flattenSubFoods(m.sub_foods, m.meal_type, flat);
    entries.push(...flat);
    byType.set(m.meal_type, [...(byType.get(m.meal_type) ?? []), ...flat]);
  }
  const foodIds = [...new Set(entries.map((e) => e.food_id))];
  return {
    entries,
    foodIds,
    byMealType: [...byType.entries()].map(([meal_type, entries]) => ({
      meal_type,
      entries,
    })),
  };
}

// Foodvisor stores proteins_100g / lipids_100g / carbs_100g / fibers_100g as
// kcal per 100 g of food (despite the misleading suffix). Atwater factors:
// protein 4, fat 9, carbs 4, fiber 2.
const KCAL_PER_G = { proteins: 4, lipids: 9, carbs: 4, fibers: 2 } as const;

function macrosGramsPer100g(food: FoodInfo): {
  proteins: number;
  lipids: number;
  carbs: number;
  fibers: number;
} {
  return {
    proteins: food.proteins_100g / KCAL_PER_G.proteins,
    lipids: food.lipids_100g / KCAL_PER_G.lipids,
    carbs: food.carbs_100g / KCAL_PER_G.carbs,
    fibers: (food.fibers_100g ?? 0) / KCAL_PER_G.fibers,
  };
}

function dataQualityWarning(food: FoodInfo): string | null {
  const m = macrosGramsPer100g(food);
  const gramsPer100g = m.proteins + m.lipids + m.carbs + m.fibers;
  if (gramsPer100g > 110) {
    return `Macros + fibers sum to ${gramsPer100g.toFixed(0)}g per 100g — Foodvisor source data looks inflated.`;
  }
  const macroKcal =
    food.proteins_100g + food.lipids_100g + food.carbs_100g;
  if (food.cal_100g > 0) {
    const drift = Math.abs(macroKcal - food.cal_100g) / food.cal_100g;
    if (drift > 0.4) {
      return `Listed calories (${food.cal_100g.toFixed(0)} kcal/100g) don't match macros (~${macroKcal.toFixed(0)} kcal/100g). Foodvisor source data is inconsistent.`;
    }
  }
  return null;
}

function describeEntry(
  entry: FlatEntry,
  food: FoodInfo | undefined,
): {
  food_id: string;
  display_name: string | null;
  brand: string | null;
  grams: number;
  calories: number;
  proteins_g: number;
  lipids_g: number;
  carbs_g: number;
  fibers_g: number;
  data_quality_warning?: string;
} {
  const grams = round(gramsForEntry(entry, food));
  if (!food) {
    return {
      food_id: entry.food_id,
      display_name: null,
      brand: null,
      grams,
      calories: 0,
      proteins_g: 0,
      lipids_g: 0,
      carbs_g: 0,
      fibers_g: 0,
      data_quality_warning: "Food details unavailable.",
    };
  }
  const ratio = grams / 100;
  const m = macrosGramsPer100g(food);
  const warning = dataQualityWarning(food);
  return {
    food_id: entry.food_id,
    display_name: food.display_name,
    brand: food.brand,
    grams,
    calories: round(food.cal_100g * ratio),
    proteins_g: round(m.proteins * ratio),
    lipids_g: round(m.lipids * ratio),
    carbs_g: round(m.carbs * ratio),
    fibers_g: round(m.fibers * ratio),
    ...(warning ? { data_quality_warning: warning } : {}),
  };
}

function gramsForEntry(entry: FlatEntry, _food: FoodInfo | undefined): number {
  // Foodvisor stores `quantity` in grams regardless of unit_id (which is just
  // the user-facing unit picker). Final grams = quantity * serving_amount.
  return entry.quantity * entry.serving_amount;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function computeTotals(
  entries: FlatEntry[],
  byFood: Map<string, FoodInfo>,
): {
  calories: number;
  proteins_g: number;
  lipids_g: number;
  carbs_g: number;
  fibers_g: number;
  items: number;
} {
  let cal = 0,
    p = 0,
    l = 0,
    c = 0,
    f = 0;
  for (const e of entries) {
    const food = byFood.get(e.food_id);
    if (!food) continue;
    const g = gramsForEntry(e, food);
    const ratio = g / 100;
    const m = macrosGramsPer100g(food);
    cal += food.cal_100g * ratio;
    p += m.proteins * ratio;
    l += m.lipids * ratio;
    c += m.carbs * ratio;
    f += m.fibers * ratio;
  }
  return {
    calories: round(cal),
    proteins_g: round(p),
    lipids_g: round(l),
    carbs_g: round(c),
    fibers_g: round(f),
    items: entries.length,
  };
}
