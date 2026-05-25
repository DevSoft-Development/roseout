import { parseSearchIntent, buildRestaurantSearchInput, buildActivitySearchInput } from "../lib/searchIntent";

const query = "Steak dinner and hookah lounge in Queens";
const intent = parseSearchIntent(query, {});
console.log("canonical intent", JSON.stringify(intent, null, 2));
console.log("restaurant query", buildRestaurantSearchInput(intent));
console.log("activity query", buildActivitySearchInput(intent));
console.log("selected restaurant names", []);
console.log("selected activity names", []);
console.log("card counts", { restaurants: 0, activities: 0 });
