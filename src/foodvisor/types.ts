export type MealType =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "custom_1"
  | "custom_2"
  | "custom_3"
  | "custom_4"
  | "custom_5";

export interface FoodSearchUnit {
  unit_id: string;
  g_per_unit: number;
  unit_qty: number;
}

export interface FoodSearchResult {
  food_id: string;
  food_state: string;
  display_name: string;
  brand: string | null;
  is_liquid: boolean;
  image_url: string | null;
  cal_100g: number;
  unit_name: string;
  unit_default: FoodSearchUnit;
  fv_grade: string | null;
  database: string;
}

export interface FoodSearchResponse {
  search_uuid: string;
  results: FoodSearchResult[];
}

export interface FoodUnit {
  unit_id: string;
  countries: string[];
  g_per_unit: number;
  unit_systems: string[];
  name: string;
}

export interface FoodInfo {
  food_id: string;
  food_type: string;
  food_state: string;
  display_name: string;
  brand: string | null;
  description: string | null;
  fv_grade: string | null;
  is_liquid: boolean;
  is_composed_food: boolean;
  g_per_serving: number;
  image_url: string | null;
  units: FoodUnit[];
  cal_100g: number;
  calories_100g: number;
  proteins_100g: number;
  lipids_100g: number;
  carbs_100g: number;
  fibers_100g: number;
  sugars_100g: number | null;
  sat_fat_100g: number | null;
  salt_100g: number | null;
  sodium_100g: number | null;
  alcohol_100g: number | null;
  barcode: string | null;
  nutriscore: string | null;
  database_source: string;
}

export interface FoodInfoResponse {
  food_info: FoodInfo[];
}

export interface MealMainFood {
  food_id: string;
  quantity: number;
  unit_id: string;
}

export interface MealSubFood {
  local_id: string;
  main_food: MealMainFood;
  serving_amount: number;
  created_at?: string;
  modified_at?: string;
  sub_foods?: MealSubFood[];
  name?: string | null;
  image_url?: string | null;
  food_tags?: unknown;
  user_recipe_tags?: unknown;
  analysis_info?: unknown;
}

export interface MacroMeal {
  meal_date: string;
  meal_type: MealType;
  sub_foods: MealSubFood[];
  id?: number;
  user?: number;
  name?: string | null;
  image_url?: string | null;
  modified_at?: string;
}

export interface MealListResponse {
  macro_meals: MacroMeal[];
}

export interface MealUpsertRequest {
  macro_meals: Array<{
    meal_date?: string;
    meal_type: MealType;
    sub_foods: MealSubFood[];
  }>;
}

export interface MealUpsertResponse {
  modified_at: string;
}

export interface MealHistoryResponse {
  history: Array<[[string, MealType], string]>;
}

export interface ProgressResponse {
  statistics: {
    calories: number[];
    classifications?: string[];
    fv_grade?: string[];
    nutrients_breakdown?: Array<[number, number, number, number]>;
    nutrients_average?: Array<[number, number, number, number]>;
    weight?: number[];
    [key: string]: unknown;
  };
}

export interface StreakResponse {
  current_streak: {
    id: number;
    start: string;
    end: string | null;
    last_activity: string;
    freezes: unknown[];
    duration: number;
  } | null;
  repairable_streak: unknown | null;
  freezes_available: Array<{
    id: number;
    streak: unknown | null;
    granted_at: string;
    used_at: string | null;
  }>;
  freezes_count_display: { current: number; max: number };
}

export interface FvGradeProgressResponse {
  [days: string]: { A?: number; B?: number; C?: number; D?: number };
}

export interface WaterEntry {
  date: string;
  water_ml: number;
}

export interface DailyReportResponse {
  nutrients: {
    proteins: string[];
    lipids: string[];
    carbs: string[];
    fibers: string[];
  };
  activity?: {
    image: string;
    food_id: string;
    unit: number;
    quantity: number;
  };
}

export interface UserSettings {
  id: number;
  name: string;
  mail: string;
  weight_current: number | null;
  weight_goal: number | null;
  weight_start: number | null;
  height: number | null;
  age: number | null;
  gender: string | null;
  max_calories: number;
  max_lipids: number;
  max_proteins: number;
  max_carbs: number;
  max_fibers: number;
  nutritional_goal?: {
    macronutrients_ratio: {
      proteins: number;
      lipids: number;
      carbs: number;
      fibers: number;
    };
    weekday_goals: Record<
      string,
      {
        calories: number;
        meal_goals: Record<
          string,
          { order: number; custom_name: string; calories_ratio: number }
        >;
      }
    >;
    meal_types_enabled: MealType[];
  };
  tags?: string[];
  date_joined?: string;
  last_seen?: string;
}
