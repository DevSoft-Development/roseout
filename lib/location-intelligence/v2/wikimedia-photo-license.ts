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


/**
 * Find only photo candidates with unusually strong, independently checkable identity.
 * Commons search relevance alone is never evidence that an image depicts a venue.
 * Fail closed; the caller can retain the business lead for later photo resolution.
 */
export async function discoverVerifiedWikimediaBusinessPhoto(business:{
  name:string; address:string; city:string; state:string;
}):Promise<WikimediaPhotoEvidence|null> {
  const clean=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\\s+/g," ");
  const name=clean(business.name),street=clean(business.address),city=clean(business.city);
  if(name.length<6||street.length<6||city.length<3)return null;
  const search=new URL("https://commons.wikimedia.org/w/api.php");
  for(const [key,value] of Object.entries({
    action:"query",generator:"search",gsrsearch:`filetype:bitmap "${business.name}" "${business.city}"`,
    gsrnamespace:"6",gsrlimit:"8",prop:"imageinfo",iiprop:"url|extmetadata",
    format:"json",formatversion:"2",
  }))search.searchParams.set(key,value);
  try {
    const response=await fetch(search,{headers:{"user-agent":"TheOutHaven/1.0 (Wikimedia-business-photo-discovery)"},
      signal:AbortSignal.timeout(12000),cache:"no-store"});
    if(!response.ok)return null;
    const data=await response.json();
    const pages=Array.isArray(data?.query?.pages)?data.query.pages:[];
    for(const page of pages.slice(0,8)){
      const info=page?.imageinfo?.[0],meta=info?.extmetadata;
      const metadataText=(key:string)=>plain(String(meta?.[key]?.value||""));
      const title=clean(String(page?.title||"").replace(/^File:/i,"").replace(/\\.[a-z0-9]+$/i,""));
      const description=clean(metadataText("ImageDescription")+" "+metadataText("ObjectName"));
      // Name must be explicit in the title AND descriptive metadata; the exact
      // street must appear in the independent file description. This intentionally
      // sacrifices recall to avoid attaching another business's photo.
      if(!title.includes(name)||!description.includes(name)||
         !description.includes(street)||!description.includes(city))continue;
      const url=String(info?.descriptionurl||"");
      if(!url.startsWith("https://commons.wikimedia.org/wiki/File:"))continue;
      const license=await verifyWikimediaPhoto(url);
      if(license)return license;
    }
  }catch{/* Wikimedia outage or malformed metadata cannot license a photo */}
  return null;
}
