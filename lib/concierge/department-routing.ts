import { classifySmsDepartment, type SmsDepartment } from "@/lib/communications/sms-intent-routing";

export type ConciergeDepartment = SmsDepartment;

export function classifyConciergeDepartment(message: string): ConciergeDepartment {
  return classifySmsDepartment(message) || "concierge";
}
