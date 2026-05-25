import OpenAI from 'openai';
import type { BoroughExpansionMode, LaneMode, ParsedSearchIntent } from './types';

type IntentPayload = {
  city?: string | null;
  borough?: string | null;
  restaurantType?: string | null;
  activityType?: string | null;
  vibe?: string | null;
  wantsWalkingDistance?: boolean;
  keywords?: string[];
  laneMode?: LaneMode;
  boroughExpansionMode?: BoroughExpansionMode;
};

export async function parseSearchIntent(client:OpenAI, query:string):Promise<ParsedSearchIntent>{
  const schema = { type:'object', additionalProperties:false, properties:{ city:{type:['string','null']}, borough:{type:['string','null']}, restaurantType:{type:['string','null']}, activityType:{type:['string','null']}, vibe:{type:['string','null']}, wantsWalkingDistance:{type:'boolean'}, keywords:{type:'array', items:{type:'string'}}, laneMode:{type:'string', enum:['balanced','restaurant_only','activity_only']}, boroughExpansionMode:{type:'string', enum:['strict','explicit_expand']}}, required:['city','borough','restaurantType','activityType','vibe','wantsWalkingDistance','keywords','laneMode','boroughExpansionMode']} as const;
  const response = await client.responses.create({ model:'gpt-4o-mini', input:`Parse this search into strict JSON intent fields only: ${query}`, text:{format:{type:'json_schema',name:'intent',schema}}});
  const raw = response.output_text || '{}';
  const parsed = JSON.parse(raw) as IntentPayload;
  return { city:parsed.city??null, borough:parsed.borough??null, restaurantType:parsed.restaurantType??null, activityType:parsed.activityType??null, vibe:parsed.vibe??null, wantsWalkingDistance:Boolean(parsed.wantsWalkingDistance), keywords:Array.isArray(parsed.keywords)?parsed.keywords:[], laneMode:parsed.laneMode ?? 'balanced', boroughExpansionMode:parsed.boroughExpansionMode ?? 'strict'};
}
