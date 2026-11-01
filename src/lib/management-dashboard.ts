import type { Identity } from "@/lib/services";
import { permits } from "@/lib/policy";
import { listMembers } from "@/lib/people/members.service";
import type { listWork } from "@/lib/work/queries";

type WorkRows = Awaited<ReturnType<typeof listWork>>;

export function canViewManagementDashboard(ctx: Identity) {
  return (
    permits(ctx.grants, "organization.manage") ||
    permits(ctx.grants, "club.executive") ||
    permits(ctx.grants, "supervisor.view") ||
    ctx.grants.some(
      (grant) =>
        grant.permission === "member.update" &&
        grant.scope === "club" &&
        grant.active,
    )
  );
}

export async function managementDashboard(
  ctx: Identity,
  work: WorkRows,
  committees: { id: string; name: string }[],
) {
  if (!canViewManagementDashboard(ctx)) return null;
  const members = await listMembers(ctx);
  const committeeRows = committees.map((committee) => {
    const committeeMembers = members
      .filter((member) =>
        member.committees.some((item) => item.id === committee.id),
      )
      .map((member) => ({
        id: member.userId,
        name: member.name,
        role: member.role?.clubRole ?? "committee_member",
      }));
    const committeeWork = work.filter(
      (item) => item.committeeId === committee.id,
    );
    const openWork = committeeWork
      .filter(
        (item) =>
          !["completed", "cancelled", "rejected", "archived"].includes(
            item.status,
          ),
      )
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        overdue: item.overdue,
        owners: item.assignments
          .filter((assignment) => assignment.role === "responsible")
          .map((assignment) => assignment.name),
      }));
    return {
      id: committee.id,
      name: committee.name,
      members: committeeMembers,
      openWork,
      completed: committeeWork.filter((item) => item.status === "completed")
        .length,
      overdue: committeeWork.filter((item) => item.overdue).length,
      inReview: committeeWork.filter((item) => item.status === "review").length,
    };
  });
  return {
    committees: committeeRows.filter(
      (committee) => committee.members.length || committee.openWork.length,
    ),
    totals: {
      members: new Set(members.map((member) => member.userId)).size,
      open: work.filter(
        (item) =>
          !["completed", "cancelled", "rejected", "archived"].includes(
            item.status,
          ),
      ).length,
      review: work.filter((item) => item.status === "review").length,
      overdue: work.filter((item) => item.overdue).length,
    },
  };
}
