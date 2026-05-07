import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { UserContext } from "../../foodvisor/client.js";
import {
  getFvGradeProgress,
  getProgress,
  getStreak,
} from "../../foodvisor/endpoints.js";

function annotateProgress(
  arr: number[] | string[] | undefined,
  end: Date,
): Array<{ date: string; value: number | string }> {
  if (!arr) return [];
  const out: Array<{ date: string; value: number | string }> = [];
  for (let i = 0; i < arr.length; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - (arr.length - 1 - i));
    out.push({ date: d.toISOString().slice(0, 10), value: arr[i]! });
  }
  return out;
}

export function registerProgressTools(
  server: McpServer,
  ctx: UserContext,
): void {
  server.registerTool(
    "get_progress",
    {
      title: "Daily progress over the last ~90 days",
      description:
        "Per-day calories, weight (0 when not weighed-in), nutrient classifications and macro breakdown for ~90 days ending today. Indices are aligned: index N corresponds to today minus (length-1-N) days. Tool returns each series annotated with its date.",
      inputSchema: {},
    },
    async () => {
      const res = await getProgress(ctx);
      const today = new Date();
      const out = {
        calories: annotateProgress(res.statistics.calories, today),
        weight_kg: annotateProgress(res.statistics.weight, today),
        fv_grade: annotateProgress(res.statistics.fv_grade, today),
        classifications: annotateProgress(res.statistics.classifications, today),
        macro_ratios_recent: res.statistics.nutrients_breakdown,
        macro_grams_recent: res.statistics.nutrients_average,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_fv_grade_distribution",
    {
      title: "Distribution of Foodvisor grades over time windows",
      description:
        "Returns the share (0..1) of meals graded A/B/C/D over rolling 7/30/90 day windows.",
      inputSchema: {},
    },
    async () => {
      const res = await getFvGradeProgress(ctx);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.registerTool(
    "get_streak",
    {
      title: "Current logging streak",
      description:
        "Current Foodvisor logging streak (consecutive days), available freezes, and last activity. Pass an optional reference date (defaults to today).",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullish()
          .describe("Reference date YYYY-MM-DD; defaults to today (server local)"),
      },
    },
    async ({ date }) => {
      const ref = date ?? new Date().toISOString().slice(0, 10);
      const res = await getStreak(ctx, ref);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );
}
