import { detectRequestedCuisines, scoreCuisineCategoryMatch } from "../lib/search/cuisine-matching";
const tests:[string,string[]][] = [["steak dinner",["steak"]],["seafood in Queens",["seafood"]],["Italian dinner",["italian"]],["oxtail dinner",["caribbean"]],["sushi date night",["japanese"]],["tacos and drinks",["mexican"]],["vegan brunch",["vegan","brunch"]]];
for (const [q,expected] of tests) { const got=detectRequestedCuisines(q); for (const e of expected) if(!got.includes(e)) throw new Error(`${q} missing ${e}: ${got}`); }
const steakhouse={name:"Prime Steakhouse",primary_category:"steakhouse",location_type:"restaurant"};
const cafe={name:"Morning Cafe",primary_category:"cafe",location_type:"restaurant"};
if(scoreCuisineCategoryMatch(steakhouse,"steak dinner",true).score<=scoreCuisineCategoryMatch(cafe,"steak dinner",true).score) throw new Error("steakhouse should beat cafe");
console.log("cuisine matching tests passed");
