import {test,expect} from "@playwright/test";
const locationId="642a2ad6-c144-47b7-b9ff-f89554edf0da";
const path="/locations/dashboard/pos/checkout-preview?locationId="+locationId+"&demo=1&fromDemoCenter=1";
test("protected Lounge demo cannot be accessed anonymously",async({browser,baseURL})=>{
 const context=await browser.newContext({storageState:{cookies:[],origins:[]}});
 const page=await context.newPage();
 await page.goto((baseURL||"http://127.0.0.1:3000")+path);
 await expect(page.getByRole("heading",{name:"Customer checkout"})).not.toBeVisible();
 await context.close();
});
test("authorized Lounge handoff sees checkout preview and cannot initiate payment",async({browser,baseURL})=>{
 const storageState=process.env.POS_LOUNGE_E2E_STORAGE_STATE;
 test.skip(process.env.POS_LOUNGE_AUTHENTICATED_CERTIFICATION!=="true", "Dedicated authenticated production certification not enabled");
 if(!storageState)throw new Error("CERTIFICATION_BLOCKED: POS_LOUNGE_E2E_STORAGE_STATE is required; no live authorized browser proof");
 const context=await browser.newContext({storageState:storageState!});
 const page=await context.newPage();
 await page.goto((baseURL||"http://127.0.0.1:3000")+path);
 await expect(page.getByRole("heading",{name:"Customer checkout"})).toBeVisible();
 await page.getByLabel("Venue type").selectOption("hybrid");
 await expect(page.getByText("Bowling lane")).toBeVisible();
 await page.getByRole("button",{name:"Review payment step"}).click();
 await expect(page.getByText(/No device is connected to this preview/i)).toBeVisible();
 await context.close();
});
