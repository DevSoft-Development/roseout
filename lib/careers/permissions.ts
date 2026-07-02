import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const CAREERS_ADMIN_PERMISSIONS = {
  dashboard: ADMIN_PAGE_ACCESS.careers,
  jobs: ADMIN_PAGE_ACCESS.careersJobsManage,
  applications: ADMIN_PAGE_ACCESS.careersApplicationsManage,
  interviews: ADMIN_PAGE_ACCESS.careersInterviewsManage,
  offers: ADMIN_PAGE_ACCESS.careersOffersManage,
  internships: ADMIN_PAGE_ACCESS.careersInternshipsManage,
  conversion: ADMIN_PAGE_ACCESS.careersTeamConversion,
  marketing: ADMIN_PAGE_ACCESS.careersMarketingReview,
} as const;
