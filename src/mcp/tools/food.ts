import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { UserContext } from "../../foodvisor/client.js";
import { getFoodDetails, searchFood } from "../../foodvisor/endpoints.js";

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

function defaultMealType(): "breakfast" | "lunch" | "dinner" | "snack" {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 22) return "dinner";
  return "snack";
}

export function registerFoodTools(server: McpServer, ctx: UserContext): void {
  server.registerTool(
    "search_food",
    {
      title: "Search Foodvisor catalog",
      description:
        "Search the Foodvisor food catalog by free-text query. Returns foods with their food_id, default unit, calories per 100g and image. Use this before log_meal to resolve foods to log.",
      inputSchema: {
        query: z.string().min(1).describe("Free-text search, e.g. 'pâtes barilla'"),
        meal_type: mealTypeSchema
          .optional()
          .describe(
            "Meal context to bias ranking. Defaults to the meal slot matching the current local time.",
          ),
        meal_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Optional meal date YYYY-MM-DD to bias ranking"),
        limit: z.number().int().min(1).max(50).optional().default(25),
        country: z.string().length(2).optional().default("FR"),
      },
    },
    async (args) => {
      const res = await searchFood(ctx, {
        ...args,
        meal_type: args.meal_type ?? defaultMealType(),
      });
      const compact = res.results.map((r) => ({
        food_id: r.food_id,
        display_name: r.display_name,
        brand: r.brand,
        cal_100g: r.cal_100g,
        unit_name: r.unit_name,
        unit_default: r.unit_default,
        is_liquid: r.is_liquid,
        fv_grade: r.fv_grade,
        image_url: r.image_url,
        database: r.database,
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { search_uuid: res.search_uuid, results: compact },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_food_details",
    {
      title: "Get nutritional details for foods",
      description:
        "Fetch full nutritional info (calories, macros, vitamins, units, nutriscore) for one or more food_ids returned by search_food.",
      inputSchema: {
        food_ids: z.array(z.string().min(1)).min(1).max(50),
      },
    },
    async ({ food_ids }) => {
      const res = await getFoodDetails(ctx, food_ids);
      return {
        content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
      };
    },
  );
}
