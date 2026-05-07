import { foodvisorRequest, UserContext } from "./client.js";
import {
  DailyReportResponse,
  FoodInfoResponse,
  FoodSearchResponse,
  FvGradeProgressResponse,
  MealHistoryResponse,
  MealListResponse,
  MealType,
  MealUpsertRequest,
  MealUpsertResponse,
  ProgressResponse,
  StreakResponse,
  UserSettings,
  WaterEntry,
} from "./types.js";

export interface SearchFoodOptions {
  query: string;
  meal_type?: MealType;
  meal_date?: string;
  limit?: number;
  country?: string;
}

export function searchFood(
  ctx: UserContext,
  opts: SearchFoodOptions,
): Promise<FoodSearchResponse> {
  return foodvisorRequest<FoodSearchResponse>(ctx, "/food/search/app/", {
    query: {
      query: opts.query,
      meal_type: opts.meal_type,
      meal_date: opts.meal_date,
      limit: opts.limit ?? 25,
      country: opts.country ?? "FR",
      in_app_location: "main",
      in_app_cta: "button",
    },
  });
}

export function getFoodDetails(
  ctx: UserContext,
  foodIds: string[],
): Promise<FoodInfoResponse> {
  return foodvisorRequest<FoodInfoResponse>(ctx, "/food/", {
    query: { food_ids: foodIds },
  });
}

export interface ListMealsOptions {
  from: string;
  to: string;
}

export function listMeals(
  ctx: UserContext,
  opts: ListMealsOptions,
): Promise<MealListResponse> {
  return foodvisorRequest<MealListResponse>(ctx, "/meal/", {
    query: { from: opts.from, to: opts.to },
  });
}

export interface MealHistoryOptions {
  from: string;
  to: string;
}

export function getMealHistory(
  ctx: UserContext,
  opts: MealHistoryOptions,
): Promise<MealHistoryResponse> {
  return foodvisorRequest<MealHistoryResponse>(ctx, "/meal/history/", {
    method: "POST",
    body: { from: opts.from, to: opts.to, history: [] },
  });
}

export function upsertMeals(
  ctx: UserContext,
  payload: MealUpsertRequest,
): Promise<MealUpsertResponse> {
  return foodvisorRequest<MealUpsertResponse>(ctx, "/meal/", {
    method: "POST",
    body: payload,
  });
}

export function getProgress(ctx: UserContext): Promise<ProgressResponse> {
  return foodvisorRequest<ProgressResponse>(ctx, "/progress/");
}

export function getFvGradeProgress(
  ctx: UserContext,
): Promise<FvGradeProgressResponse> {
  return foodvisorRequest<FvGradeProgressResponse>(ctx, "/progress/fv_grade/");
}

export function getDailyReport(
  ctx: UserContext,
  calBurned = 0,
): Promise<DailyReportResponse> {
  return foodvisorRequest<DailyReportResponse>(ctx, "/daily_report/", {
    query: { cal_burned: calBurned },
  });
}

export function getStreak(
  ctx: UserContext,
  date: string,
): Promise<StreakResponse> {
  return foodvisorRequest<StreakResponse>(ctx, "/streak/", { query: { date } });
}

export interface WaterRangeOptions {
  start: string;
  end: string;
}

export function getWaterLog(
  ctx: UserContext,
  opts: WaterRangeOptions,
): Promise<WaterEntry[]> {
  return foodvisorRequest<WaterEntry[]>(ctx, "/trackers/water/", {
    query: { start: opts.start, end: opts.end },
  });
}

export function getUserMe(ctx: UserContext): Promise<UserSettings> {
  return foodvisorRequest<UserSettings>(ctx, "/user/me/");
}
