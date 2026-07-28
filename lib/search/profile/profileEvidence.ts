import type { EvidenceSource, EvidenceStrength } from "../v2/taxonomy";
import type { ProfileEvidence } from "./profileTypes";
export const evidence = (taxonomyId:string,source:EvidenceSource,strength:EvidenceStrength,sourceField:string,sourceValue:string,reason:string):ProfileEvidence => ({taxonomyId,source,strength,sourceField,sourceValue,normalizedValue:sourceValue.trim().toLowerCase(),reason});
export const isStrongEvidence=(item:ProfileEvidence)=>item.strength==="strong"||item.strength==="authoritative";
