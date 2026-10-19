import {describe,it,expect} from "vitest";
import {extractOfficialSocialProfiles} from "../official-website-resolver";
describe("LI V2 official social acquisition",()=>{
 it("keeps multiple official website-linked social profiles with source",()=>{
  const page="https://example.com/about";
  const html='<a href="https://www.instagram.com/examplecafe/">Instagram</a><a href="https://www.tiktok.com/@examplecafe">TikTok</a><a href="https://www.facebook.com/examplecafe">Facebook</a>';
  const found=extractOfficialSocialProfiles(html,page);
  expect(found.instagram).toEqual({url:"https://www.instagram.com/examplecafe/",sourceUrl:page});
  expect(found.tiktok?.url).toContain("@examplecafe");
  expect(found.facebook?.url).toContain("examplecafe");
 });
 it("excludes sharing links, wrong hosts and insecure links",()=>{
  const html='<a href="https://evilinstagram.com/fake">no</a><a href="https://instagram.com/p/123">post</a><a href="http://x.com/user">insecure</a><a href="https://facebook.com/sharer.php">share</a>';
  const found=extractOfficialSocialProfiles(html,"https://example.com");
  expect(Object.keys(found)).toHaveLength(0);
 });
});
