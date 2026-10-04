// 👥 الناس والعضوية — الواجهة الموحدة
// بإعادة تصدير من ملفات الخدمات المخصصة، دون احتواء منطق إضافي.

// Members
export {
  listMembers,
  getProfile,
  updateMember,
  changeMemberStatus,
  setClubRole,
  memberView,
  roleHistory,
  committeeHistory,
  statusHistory,
  currentPlacements,
  activeMemberRoles,
  mentorCandidates,
  peopleOptions,
  emptyPeopleOptions,
} from "./members.service";

// Applications
export {
  listApplications,
  getApplication,
  createApplication,
  assignReviewer,
  addReviewNote,
  decideApplication,
  convertToMember,
  listTransfers,
} from "./applications.service";

// Onboarding
export {
  createPlan,
  startOnboarding,
  getPlan,
  completeStep,
  updateStep,
  listPlans,
} from "./onboarding.service";

// Contribution, XP, impact, badges
export {
  seedPeopleConfiguration,
  memberMetrics,
  grantContribution,
  adjustPoints,
  totalsFor,
  listTransactions,
  evaluateBadges,
  awardBadge,
  revokeBadge,
  listBadges,
  badgeDefinitions,
  passport,
  memberTimeline,
  achievementOptions,
} from "./contribution.service";

// Volunteer hours
export { listHours, submitHours, decideHours } from "./volunteer.service";

// Achievements, mentoring, personal view
export {
  listAchievements,
  createAchievement,
  verifyAchievement,
  assignMentor,
  updateMentor,
  listMentorAssignments,
  todayFor,
} from "./development.service";

// Transfers, handover, offboarding
export {
  requestTransfer,
  decideTransfer,
  getTransfer,
  listHandovers,
  createHandover,
  updateHandover,
  offboardMember,
  placeInCommittee,
  openWorkFor,
  offboardReasonLabels,
} from "./transitions.service";

// Queries
export {
  peopleLists,
  peopleListsSafe,
  emptyPeopleLists,
  memberDetail,
  peopleInbox,
  myToday,
  searchPeople,
  peopleHref,
} from "./queries";

// Types
export * from "./types";
export { visibleMemberIds, memberVisibility, isManager, isSupervisor } from "./helpers";
