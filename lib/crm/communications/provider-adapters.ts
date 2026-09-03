import "server-only";
import { sendRenderedEmail } from "@/lib/email/sender";
export type ProviderSendResult={status:"sent"|"skipped"|"error";providerMessageId?:string;error?:string};
export interface EmailProviderAdapter { send(input:{to:string;fromPurpose:string;subject:string;text:string;html:string}):Promise<ProviderSendResult> }
export interface SmsProviderAdapter { send(input:{to:string;from:string;body:string}):Promise<ProviderSendResult> }
export const resendEmailAdapter:EmailProviderAdapter={async send(input){const result=await sendRenderedEmail({to:input.to,department:input.fromPurpose,rendered:{subject:input.subject,text:input.text,html:input.html,preview:input.subject,department:input.fromPurpose as any}});return {status:result.status,providerMessageId:result.id||undefined,error:result.error}}};
