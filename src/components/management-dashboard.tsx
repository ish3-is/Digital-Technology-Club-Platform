import Link from "next/link";
import { ArrowLeft, CircleAlert, ClipboardCheck, UsersRound } from "lucide-react";
import { stateLabels } from "@/lib/work/model";

export type ManagementDashboardData = {
  totals: { members: number; open: number; review: number; overdue: number };
  committees: {
    id: string;
    name: string;
    completed: number;
    overdue: number;
    inReview: number;
    members: { id: string; name: string; role: string }[];
    openWork: {
      id: string;
      title: string;
      status: string;
      overdue: boolean;
      owners: string[];
    }[];
  }[];
};

export function ManagementDashboard({
  data,
}: {
  data: ManagementDashboardData;
}) {
  return (
    <section className="management-dashboard" aria-labelledby="management-heading">
      <div className="management-title">
        <div>
          <h2 id="management-heading">المشهد التنفيذي بالأسماء</h2>
          <p>تفاصيل حقيقية من نطاقك: الفرق، المسؤولون، والعمل المفتوح.</p>
        </div>
        <Link href="/intelligence/executive">
          التقرير التنفيذي <ArrowLeft size={16} />
        </Link>
      </div>
      <div className="management-totals">
        <div><UsersRound size={18} /><strong>{data.totals.members}</strong><span>عضوًا</span></div>
        <div><ClipboardCheck size={18} /><strong>{data.totals.open}</strong><span>عملًا مفتوحًا</span></div>
        <div><CircleAlert size={18} /><strong>{data.totals.review}</strong><span>في المراجعة</span></div>
        <div className={data.totals.overdue ? "attention" : ""}><CircleAlert size={18} /><strong>{data.totals.overdue}</strong><span>متأخرًا</span></div>
      </div>
      <div className="management-committees">
        {data.committees.map((committee) => (
          <article key={committee.id} className="management-committee">
            <header>
              <div>
                <h3>{committee.name}</h3>
                <p>{committee.members.length} عضو · {committee.openWork.length} أعمال ظاهرة</p>
              </div>
              <Link href={`/committees/${committee.id}`} aria-label={`فتح ${committee.name}`}>
                <ArrowLeft size={18} />
              </Link>
            </header>
            <div className="management-members">
              {committee.members.slice(0, 8).map((member) => (
                <Link href={`/people?tab=members&member=${member.id}`} key={member.id}>
                  <span>{member.name.slice(0, 1)}</span>{member.name}
                </Link>
              ))}
              {committee.members.length > 8 && <small>+{committee.members.length - 8} أعضاء</small>}
            </div>
            {committee.openWork.length ? (
              <div className="management-work">
                {committee.openWork.map((work) => (
                  <Link href={`/work?item=${work.id}`} key={work.id}>
                    <span>
                      <strong>{work.title}</strong>
                      <small>{work.owners.length ? work.owners.join("، ") : "لم يُعيّن مسؤول"}</small>
                    </span>
                    <em className={work.overdue ? "late" : ""}>
                      {work.overdue ? "متأخر" : stateLabels[work.status] ?? work.status}
                    </em>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="management-clear">لا يوجد عمل مفتوح في نطاقك لهذه اللجنة.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
