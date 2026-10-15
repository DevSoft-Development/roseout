/** Strict per-file Wikimedia Commons verification. No blanket Commons licensing. */
export type WikimediaPhotoEvidence = {
  filePageUrl: string;
  imageUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  verifiedAt: string;
};
const allowedLicenses: Record<string,string> = {
  "CC BY 4.0":"https://creativecommons.org/licenses/by/4.0/",
  "CC BY-SA 4.0":"https://creativecommons.org/licenses/by-sa/4.0/",
  "CC BY 3.0":"https://creativecommons.org/licenses/by/3.0/",
  "CC BY-SA 3.0":"https://creativecommons.org/licenses/by-sa/3.0/",
};
const plain = (s:string)=>s.replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").replace(/\\s+/g," ").trim();
export async function verifyWikimediaPhoto(filePageUrl:string):Promise<WikimediaPhotoEvidence|null> {
  let url:URL;
  try {url=new URL(filePageUrl);}catch{return null;}
  if(url.protocol!=="https:" || url.hostname!=="commons.wikimedia.org" || !url.pathname.startsWith("/wiki/File:"))return null;
  const title=decodeURIComponent(url.pathname.slice(6)).replace(/_/g," ");
  if(!title.startsWith("File:") || title.length>250)return null;
  const api=new URL("https://commons.wikimedia.org/w/api.php");
  for(const [key,value] of Object.entries({action:"query",prop:"imageinfo",iiprop:"url|extmetadata",titles:title,format:"json",formatversion:"2"}))api.searchParams.set(key,value);
  const response=await fetch(api,{headers:{"user-agent":"TheOutHaven/1.0 (Wikimedia-license-verification)"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)return null;
  const data=await response.json();
  const page=data?.query?.pages?.[0];
  if(page?.missing || page?.title!==title)return null;
  const info=page?.imageinfo?.[0],meta=info?.extmetadata;
  const value=(name:string)=>plain(String(meta?.[name]?.value||""));
  const license=value("LicenseShortName"),expected=allowedLicenses[license];
  const author=value("Artist")||value("Attribution");
  if(!expected || !author || value("NonFree")==="true" || value("Restrictions"))return null;
  const licenseUrl=value("LicenseUrl");
  if(!licenseUrl.startsWith(expected.slice(0,-1)))return null;
  const imageUrl=String(info?.url||"");
  if(!imageUrl.startsWith("https://upload.wikimedia.org/wikipedia/commons/"))return null;
  const fileUrl=String(info?.descriptionurl||"");
  if(!fileUrl.startsWith("https://commons.wikimedia.org/wiki/File:"))return null;
  return {filePageUrl:fileUrl,imageUrl,author,license,licenseUrl,attribution:`${author} · ${license} · ${fileUrl}`,verifiedAt:new Date().toISOString()};
}
