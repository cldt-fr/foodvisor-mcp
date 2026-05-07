import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { UserContext } from "../../foodvisor/client.js";
import { getWaterLog } from "../../foodvisor/endpoints.js";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export function registerTrackerTools(
  server: McpServer,
  ctx: UserContext,
): void {
  server.registerTool(
    "get_water_log",
    {
      title: "Hydration log",
      description:
        "Returns the daily water intake (ml) on a date range. Days without entries are omitted.",
      inputSchema: {
        start: dateSchema,
        end: dateSchema,
      },
    },
    async ({ start, end }) => {
      const res = await getWaterLog(ctx, { start, end });
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );
}
