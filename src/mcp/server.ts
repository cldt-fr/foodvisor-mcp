import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UserContext } from "../foodvisor/client.js";
import { registerFoodTools } from "./tools/food.js";
import { registerMealTools } from "./tools/meal.js";
import { registerProfileTools } from "./tools/profile.js";
import { registerProgressTools } from "./tools/progress.js";
import { registerTrackerTools } from "./tools/trackers.js";

export function createMcpServer(ctx: UserContext): McpServer {
  const server = new McpServer({
    name: "foodvisor-mcp",
    version: "0.1.0",
  });

  registerFoodTools(server, ctx);
  registerMealTools(server, ctx);
  registerProgressTools(server, ctx);
  registerTrackerTools(server, ctx);
  registerProfileTools(server, ctx);

  return server;
}
