export type ActivityLevel="sedentary"|"light"|"moderate"|"high"|"very_high";
export type GoalType="lose"|"maintain"|"gain";
export interface NutritionProfile{age:number|null;gender:string|null;height:number|null;weight:number|null;activity_level:string;goal_type:string;allergens?:string}
export interface NutritionVector{protein:number;fat:number;carb:number;fiber:number}
export interface NutritionTargets extends NutritionVector{calories:number;bmr:number;activity:ActivityLevel;goal:GoalType}
export interface FoodCandidate extends NutritionVector{id:number;name:string;category:string;calorie:number;unit:string;allergens:string;serving_g?:number;serving_label?:string;serving_source?:string}
