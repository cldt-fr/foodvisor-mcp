import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UserContext } from "../../foodvisor/client.js";
import { getUserMe } from "../../foodvisor/endpoints.js";

export function registerProfileTools(
  server: McpServer,
  ctx: UserContext,
): void {
  server.registerTool(
    "get_profile",
    {
      title: "User profile and nutritional goals",
      description:
        "Returns the Foodvisor user profile: weight (current/goal/start), height, age, sex, calorie/macro caps, per-weekday calorie goals, macro ratios, enabled meal types, and tags.",
      inputSchema: {},
    },
    async () => {
      const me = await getUserMe(ctx);
      const compact = {
        id: me.id,
        name: me.name,
        mail: me.mail,
        weight_current_kg: me.weight_current,
        weight_goal_kg: me.weight_goal,
        weight_start_kg: me.weight_start,
        height_cm: me.height,
        age: me.age,
        gender: me.gender,
        daily_caps: {
          calories: me.max_calories,
          proteins_g: Math.round(me.max_proteins / 4),
          lipids_g: Math.round(me.max_lipids / 9),
          carbs_g: Math.round(me.max_carbs / 4),
          fibers_g: Math.round(me.max_fibers / 2),
        },
        nutritional_goal: me.nutritional_goal,
        tags: me.tags,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(compact, null, 2) }],
      };
    },
  );
}
