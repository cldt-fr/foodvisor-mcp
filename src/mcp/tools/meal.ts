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
  quantity: z
    .number()
    .positive()
    .describe(
      "Quantity in grams (Foodvisor stores quantities in grams). Default to 100 if unsure.",
    ),
  unit_id: z
    .string()
    .min(1)
    .nullish()
    .describe(
      "Unit identifier (display hint). Use unit_default.unit_id from search_food when available, else 'unit_g'.",
    ),
  serving_amount: z
    .number()
    .positive()
    .nullish()
    .describe(
      "Multiplier applied to quantity. Final grams = quantity * serving_amount.",
    ),
});

export function registerMealTools(server: McpServer, ctx: UserContext): void {
  server.registerTool(
    "log_meal",
    {
      title: "Log a meal in Foodvisor",
      description:
        "Add foods to a meal slot (breakfast/lunch/dinner/snack/custom_*) on a given date. Foods must reference food_ids resolved via search_food. Existing entries on the same date+meal_type are appended (Foodvisor merges).",
      inputSchema: {
        meal_date: dateSchema.describe("Date of the meal, YYYY-MM-DD"),
        meal_type: mealTypeSchema,
        foods: z.array(foodEntrySchema).min(1).max(50),
      },
    },
    async ({ meal_date, meal_type, foods }) => {
      const now = new Date().toISOString();
      const sub_foods: MealSubFood[] = foods.map((f) => ({
        local_id: randomUUID().toUpperCase(),
        created_at: now,
        modified_at: now,
        serving_amount: f.serving_amount ?? 1,
        main_food: {
          food_id: f.food_id,
          quantity: f.quantity,
          unit_id: f.unit_id ?? "unit_g",
        },
      }));

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
                logged_count: foods.length,
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
      title: "List logged meals",
      description:
        "Return logged meals (with sub_foods, food_ids, quantities) on a date range. Pass only `from` (and omit `to`) for a single-day query. Use get_food_details to enrich food_ids with nutrition data.",
      inputSchema: {
        from: dateSchema,
        to: dateSchema
          .nullish()
          .describe("Optional end date YYYY-MM-DD; defaults to `from`"),
      },
    },
    async ({ from, to }) => {
      const res = await listMeals(ctx, { from, to: to ?? from });
      return {
        content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
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

      const targets = {
        calories: profile.max_calories,
        proteins_g: profile.max_proteins,
        lipids_g: profile.max_lipids,
        carbs_g: profile.max_carbs,
        fibers_g: profile.max_fibers,
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

function gramsForEntry(entry: FlatEntry): number {
  // Foodvisor stores `quantity` in grams already; unit_id is only a display hint.
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
    const g = gramsForEntry(e);
    const ratio = g / 100;
    cal += food.cal_100g * ratio;
    p += food.proteins_100g * ratio;
    l += food.lipids_100g * ratio;
    c += food.carbs_100g * ratio;
    f += food.fibers_100g * ratio;
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
