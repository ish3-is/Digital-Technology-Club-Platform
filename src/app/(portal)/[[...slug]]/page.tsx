import Link from "next/link";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Inbox,
  Sparkles,
  Users,
  CalendarDays,
  FileCheck2,
  BookOpen,
  ShieldCheck,
  CircleDashed,
  Layers3,
  Flag,
  Bell,
} from "lucide-react";
import { identity, foundation, committee, HttpError } from "@/lib/services";
import { permits } from "@/lib/policy";
import { Shell } from "@/components/shell";
import { ReadButton, CommitteeEditor, Sessions } from "@/components/actions";
import { AuthForm } from "@/components/auth-form";
import { WorkCenter, type WorkMode } from "@/components/work-center";
import { listWork, inbox, workOptions } from "@/lib/work/queries";
import { grant } from "@/lib/work/access";
import { kinds, type Kind } from "@/lib/work/model";
import { EventCenter } from "@/components/event-center";
import { listEvents, eventDetail, eventOptions } from "@/lib/events/queries";
import { governanceInbox } from "@/lib/governance/queries";
import { SupervisorBrief } from "@/components/supervisor-brief";
export const dynamic = "force-dynamic";
function Empty({
  icon: Icon = Inbox,
  title,
  body,
}: {
  icon?: typeof Inbox;
  title: string;
  body: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={29} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
function Heading({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{label}</span>
      <h1>{title}</h1>
      <p>{body}</p>
    </div>
  );
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug = [] } = await params;
  const ctx = await identity(await headers()).catch((e) => {
    if (e instanceof HttpError && e.status === 409) redirect("/setup");
    redirect("/login");
  });
  const data = await foundation(ctx);
  const section = slug[0] || "home";
  const query = await searchParams;
  const actions = await inbox(ctx);
  const homeWork = section === "home" ? await listWork(ctx) : [];
  const upcomingMeetings = homeWork
    .filter(
      (w) =>
        w.kind === "meeting" &&
        w.status === "scheduled" &&
        w.startAt &&
        w.startAt >= new Date(),
    )
    .sort((a, b) => a.startAt!.getTime() - b.startAt!.getTime())
    .slice(0, 3);
  const createKinds = kinds.filter(
    (k) =>
      k !== "decision" &&
      data.terms.some((t) =>
        [null, ...data.committees.map((c) => c.id)].some((c) =>
          grant(ctx, `${k}.create`, c, t.id, ctx.user.id),
        ),
      ),
  );
  // People items flow into the same universal inbox rather than a separate queue.
  const { peopleInbox } = await import("@/lib/people/queries");
  const peopleActions = await peopleInbox(ctx).catch(() => []);
  const todayActions = [
    ...actions.map((a) => ({
      id: a.id,
      title: a.title,
      action: a.action,
      href: `/work?item=${a.id}`,
      bucket: a.bucket,
    })),
    ...peopleActions.map((a) => ({
      id: a.id,
      title: a.title,
      action: a.action,
      href: a.href,
      bucket: "الناس",
    })),
  ];
  let content: React.ReactNode;
  if (section === "events") {
    if (slug.length > 2) notFound();
    let selected = null;
    if (slug[1]) {
      try {
        selected = await eventDetail(ctx, slug[1]);
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) notFound();
        throw e;
      }
    }
    content = (
      <EventCenter
        userId={ctx.user.id}
        initial={JSON.parse(JSON.stringify(selected))}
        items={JSON.parse(JSON.stringify(await listEvents(ctx)))}
        options={JSON.parse(JSON.stringify(await eventOptions(ctx)))}
        create={query.create === "event"}
      />
    );
  } else if (section === "work" || section === "inbox") {
    const mode = section === "inbox" ? "inbox" : slug[1] || "mine";
    if (
      !["inbox", "mine", "tasks", "requests", "meetings", "decisions"].includes(
        mode,
      ) ||
      slug.length > 2
    )
      notFound();
    const [items, options] = await Promise.all([
      listWork(ctx),
      workOptions(ctx),
    ]);
    content = (
      <WorkCenter
        initialItems={JSON.parse(JSON.stringify(items))}
        initialInbox={JSON.parse(JSON.stringify(actions))}
        options={JSON.parse(JSON.stringify(options))}
        userId={ctx.user.id}
        mode={mode as WorkMode}
        committeeId={query.committee}
        eventId={query.event}
        openId={query.item}
        createKind={
          kinds.includes(query.create as Kind)
            ? (query.create as Kind)
            : undefined
        }
      />
    );
  } else if (section === "home")
    content = (
      <>
        <div className="greeting-line">
          <span className="eyebrow">مساحتك اليومية</span>
          <span className="date">
            {new Date().toLocaleDateString("ar-SA", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "Asia/Riyadh",
            })}
          </span>
        </div>
        <div className="welcome">
          <div>
            <h1>
              السلام عليكم يا {ctx.user.name.split(" ")[0]}{" "}
              <span className="wave">👋</span>
            </h1>
            <p>هنا يبدأ يومك في النادي. كل ما يهمك، في مكان واحد.</p>
          </div>
          <Link className="button primary" href="/inbox">
            افتح صندوق الوارد <ArrowLeft size={17} />
          </Link>
        </div>
        <div className="home-grid">
          <div className="home-primary">
            <section className="today-panel panel">
              <div className="section-title">
                <h2>وش عليك اليوم؟</h2>
                <span className="subtle-chip">مساحة عملك</span>
              </div>
              {todayActions.length ? (
                <div className="home-work-actions">
                  {todayActions.slice(0, 6).map((w) => (
                    <Link key={w.id} href={w.href}>
                      <span>
                        <strong>{w.title}</strong>
                        <small>{w.action}</small>
                      </span>
                      <span>
                        {w.bucket}
                        <ArrowLeft size={16} />
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={Check}
                  title="بداية هادئة، ومساحة لإنجاز جديد"
                  body="لا توجد عناصر تحتاج إجراءك حاليًا. ستظهر هنا المهام والطلبات والدعوات والمراجعات الفعلية."
                />
              )}
              <div className="today-footer">
                <span>
                  <span className="status-dot" /> كل إجراء سيظهر في مكانه
                </span>
                <Link href="/work">
                  اذهب إلى العمل <ArrowLeft size={15} />
                </Link>
              </div>
            </section>
            <section className="panel activity-panel">
              <div className="section-title">
                <h2>ماذا تغير منذ آخر دخول؟</h2>
                <span className="muted">آخر النشاطات المتاحة لك</span>
              </div>
              {data.activities.length ? (
                data.activities.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <span className="activity-symbol">
                      <Check size={16} />
                    </span>
                    <div>
                      <strong>
                        {(a.metadata as { label?: string }).label ||
                          "تحديث في مساحة النادي"}
                      </strong>
                      <small>
                        {new Date(a.createdAt).toLocaleString("ar-SA", {
                          timeZone: "Asia/Riyadh",
                        })}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  icon={CircleDashed}
                  title="لم تُسجّل تحديثات بعد"
                  body="ستظهر هنا تغييرات ملفك واللجان التي يمكنك الوصول إليها."
                />
              )}
            </section>
            <div className="contribution-banner">
              <span className="contribution-icon">
                <Flag size={28} />
              </span>
              <div>
                <h3>كل مساهمة تبدأ بخطوة</h3>
                <p>مكانك في الفريق، وما تصنعه معه، هو بداية أثرك.</p>
              </div>
              <Link href="/profile" aria-label="افتح ملفك الشخصي">
                <ArrowLeft size={23} />
              </Link>
            </div>
          </div>
          <aside className="home-secondary">
            <section className="pulse panel">
              <div className="section-title">
                <h2>
                  <span className="pulse-mark" /> نبض النادي
                </h2>
              </div>
              <p className="muted">صورة واضحة، من بيانات حقيقية.</p>
              <div className="pulse-empty">
                <CircleDashed size={32} />
                <h3>{homeWork.filter((w) => w.overdue).length} أعمال متأخرة</h3>
                <p>
                  {homeWork.filter((w) => w.status === "review").length} بانتظار
                  المراجعة ·{" "}
                  {homeWork.filter((w) => w.status === "completed").length}{" "}
                  مكتملة
                </p>
              </div>
              <details>
                <summary>كيف يُقرأ نبض النادي؟</summary>
                <p>
                  الأعداد من الأعمال المتاحة لصلاحياتك. يتأخر العمل عند تجاوز
                  موعده وهو غير مكتمل أو ملغى؛ المراجعات تنتظر قرار المراجع
                  المحدد.
                </p>
              </details>
            </section>
            <section className="panel upcoming">
              <h2>على الأفق</h2>
              {upcomingMeetings.length ? (
                upcomingMeetings.map((w) => (
                  <Link
                    className="mini-empty"
                    key={w.id}
                    href={`/work/meetings?item=${w.id}`}
                  >
                    <CalendarDays size={23} />
                    <div>
                      <strong>{w.title}</strong>
                      <p>
                        {w.startAt!.toLocaleString("ar-SA", {
                          timeZone: "Asia/Riyadh",
                        })}
                      </p>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="mini-empty">
                  <CalendarDays size={23} />
                  <div>
                    <strong>مساحة للقاء القادم</strong>
                    <p>لا توجد اجتماعات قادمة متاحة لك.</p>
                  </div>
                </div>
              )}
            </section>
            <section className="your-spaces">
              <span className="eyebrow">أقرب إلى فريقك</span>
              <Link href="/committees">
                <Users size={20} />
                <div>
                  <strong>مساحات اللجان</strong>
                  <small>الناس الذين تصنع معهم الفرق</small>
                </div>
                <ArrowLeft size={17} />
              </Link>
              <Link href="/knowledge">
                <BookOpen size={20} />
                <div>
                  <strong>معرفة تبقى</strong>
                  <small>خبراتنا تنتقل، ولا تبدأ من الصفر</small>
                </div>
                <ArrowLeft size={17} />
              </Link>
            </section>
          </aside>
        </div>
      </>
    );
  else if (section === "notifications")
    content = (
      <>
        <Heading
          label="كل ما ينتظر إجراءك"
          title="التنبيهات"
          body="تحديثات ومعلومات موجهة لك. الإجراءات المطلوبة في صندوق الوارد."
        />
        <div className="inbox-layout">
          <section className="panel">
            <div className="section-title">
              <h2>تنبيهاتك</h2>
              <span className="subtle-chip">الأحدث أولًا</span>
            </div>
            {data.notifications.length ? (
              data.notifications.map((n) => (
                <article className="notification-row" key={n.id}>
                  <span className="activity-symbol">
                    <Bell size={18} />
                  </span>
                  <div>
                    <h3>{n.title}</h3>
                    <p>{n.body}</p>
                    <small>{n.readAt ? "تم الاطلاع" : "غير مقروء"}</small>
                  </div>
                  {!n.readAt && <ReadButton id={n.id} />}
                </article>
              ))
            ) : (
              <Empty
                title="صندوقك هادئ الآن"
                body="عندما يكون هناك ما يحتاج انتباهك، ستجده هنا."
              />
            )}
          </section>
          <aside className="info-note">
            <ShieldCheck size={23} />
            <h3>الوضوح أولًا</h3>
            <p>التنبيه يخبرك بما حدث، وصندوق الوارد يوضح ما يحتاج إجراءك.</p>
          </aside>
        </div>
      </>
    );
  else if (section === "committees" && slug[1]) {
    const c = await committee(ctx, slug[1]).catch(() => notFound());
    content = (
      <>
        <Heading
          label="مساحة اللجنة"
          title={c.name}
          body="سياق واحد للفريق والعمل والمعرفة."
        />
        {permits(ctx.grants, "committee.update", { committeeId: c.id }) ? (
          <section className="panel">
            <h2>عن اللجنة</h2>
            <CommitteeEditor id={c.id} description={c.description} />
          </section>
        ) : (
          <section className="panel">
            <h2>عن اللجنة</h2>
            <p>{c.description || "لم تُضف نبذة لهذه اللجنة بعد."}</p>
          </section>
        )}
        <section className="panel spaced">
          <h2>عمل الفريق</h2>
          <p>المهام والطلبات والاجتماعات المرتبطة بهذه اللجنة.</p>
          <div className="detail-actions">
            <Link
              className="button secondary"
              href={`/work/tasks?committee=${c.id}`}
            >
              افتح عمل اللجنة
            </Link>
            {createKinds.includes("task") &&
              data.terms.some((t) => grant(ctx, "task.create", c.id, t.id)) && (
                <Link
                  className="button primary"
                  href={`/work?create=task&committee=${c.id}`}
                >
                  مهمة لهذه اللجنة
                </Link>
              )}
          </div>
        </section>
      </>
    );
  } else if (section === "committees")
    content = (
      <>
        <Heading
          label="فرق تصنع الأثر"
          title="اللجان"
          body="مساحات الفرق التي يمكنك الوصول إليها بحسب دورك ونطاقه."
        />
        {data.committees.length ? (
          <div className="committee-grid">
            {data.committees.map((c) => (
              <Link
                className="panel committee-card"
                href={`/committees/${c.id}`}
                key={c.id}
              >
                <Users size={28} />
                <h2>{c.name}</h2>
                <p>{c.description || "مساحة الفريق وتعاونه."}</p>
                <span>
                  ادخل مساحة اللجنة <ArrowLeft size={17} />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <section className="panel">
            <Empty
              icon={Users}
              title="لم تُسند إليك مساحة لجنة بعد"
              body="ستظهر لجانك هنا عندما تعتمد الإدارة تعيينك. تواصل مع مسؤول النادي إذا كنت تتوقع وجود لجنة."
            />
          </section>
        )}
      </>
    );
  else if (section === "profile")
    content = (
      <>
        <Heading
          label="حسابك في النادي"
          title="الملف الشخصي والأمان"
          body="حدّث اسمك، وراجع جلسات الدخول إلى حسابك."
        />
        <div className="profile-grid">
          <section className="panel">
            <h2>بياناتك الأساسية</h2>
            <p dir="ltr" className="email">
              {ctx.user.email}
            </p>
            <AuthForm mode="setup" name={ctx.user.name} />
          </section>
          <Sessions />
        </div>
      </>
    );
  else if (section === "admin") {
    if (!data.admin) notFound();
    content = (
      <>
        <Heading
          label="إدارة المقر"
          title="أساس منظم، وصلاحيات واضحة"
          body="مساحة الإدارة متاحة لك بناءً على صلاحية إدارة التنظيم."
        />
        <section className="panel">
          <h2>التنظيم والصلاحيات</h2>
          <p>
            تُدار الحسابات والأدوار والتعيينات في المرحلة التأسيسية عبر أدوات
            التشغيل الموثقة. لا تمنح العضوية صلاحيات خارج نطاقها.
          </p>
          <div className="list-row">
            <span>سجل التدقيق</span>
            <span className="subtle-chip">منفصل عن النشاط</span>
          </div>
          <p className="muted">
            تُسجل تغييرات الحساب واللجان والجلسات. واجهة تحرير السياسات ضمن
            التوسعات القادمة.
          </p>
        </section>
      </>
    );
  } else if (section === "supervisor" && slug[1] === "brief") {
    if (!data.supervisor) notFound();
    const items = await governanceInbox(ctx);
    content = (
      <>
        <Heading
          label="ملخص المشرف"
          title="ما يحتاج مراجعتك"
          body="متابعة تحافظ على استقلالية الفريق، ووضوح القرار. تقارير المراجعة والاعتمادات في حوكمة النادي."
        />
        {items.length ? (
          <section className="panel">
            <div className="section-title">
              <h2>التقرير المفتوح للمراجعة ({items.length})</h2>
              <span className="subtle-chip">حوكمة النادي</span>
            </div>
            {items.map((a) => (
              <article key={a.id} className="gov-row">
                <Link href={a.href}>{a.title}</Link>
                <p>{a.reason}</p>
                <span className="subtle-chip">{a.severity === "high" ? "أولوية" : "متابعة"}</span>
              </article>
            ))}
          </section>
        ) : (
          <section className="panel">
            <Empty
              icon={FileCheck2}
              title="لا توجد تقارير للمراجعة"
              body="تظهر التقارير المقدمة إليك عند إطلاق مسار الحوكمة والاعتمادات."
            />
          </section>
        )}
        <section className="panel">
          <h2>رابط سريع</h2>
          <Link href="/governance" className="button secondary">
            افتح الحوكمة <ArrowLeft size={15} />
          </Link>
        </section>
      </>
    );
  } else if (section === "supervisor") {
    if (!data.supervisor) notFound();
    // The brief is built from the intelligence layer, so the supervisor sees the
    // same derived operational numbers as leadership — scoped by their grants,
    // and with no committee-internal editing.
    const { supervisorBrief } = await import("@/lib/intelligence/supervisor");
    const brief = await supervisorBrief(ctx, query.range ?? "term").catch(() => null);
    content = brief ? (
      <SupervisorBrief brief={JSON.parse(JSON.stringify(brief))} />
    ) : (
      <>
        <Heading
          label="رؤية المشرف"
          title="ما يحتاج مراجعتك"
          body="متابعة تحافظ على استقلالية الفريق، ووضوح القرار."
        />
        <section className="panel">
          <Empty
            icon={FileCheck2}
            title="تعذر تحميل ملخص الإشراف"
            body="تعذّر بناء الملخص من السجلات الحالية. لن تظهر أرقام غير مؤكدة."
          />
        </section>
      </>
    );
  } else if (section === "club")
    content = (
      <>
        <Heading
          label="هويتنا وسياق عملنا"
          title="النادي"
          body="نادي التقنية الرقمية — جامعة الملك خالد"
        />
        <section className="panel">
          <h2>الفصل الأكاديمي</h2>
          {data.terms.length ? (
            data.terms.map((t) => (
              <div className="list-row" key={t.id}>
                <strong>{t.name}</strong>
                <span>{t.year}</span>
              </div>
            ))
          ) : (
            <Empty
              icon={CalendarDays}
              title="لم يُفتح فصل أكاديمي بعد"
              body="تحدد الإدارة الفصل قبل بدء الأعمال، للحفاظ على تاريخ كل فريق وإنجاز."
            />
          )}
        </section>
      </>
    );
  else {
    const entries: Record<
      string,
      { title: string; body: string; empty: string; icon: typeof Inbox }
    > = {
      work: {
        title: "العمل",
        body: "كل مهمة لها مسؤول، وكل عمل له سياق.",
        empty: "وحدة العمل في المرحلة التالية",
        icon: Layers3,
      },
      events: {
        title: "الفعاليات",
        body: "من الفكرة إلى التقرير، في غرفة عمليات واحدة.",
        empty: "لم يبدأ تشغيل الفعاليات بعد",
        icon: CalendarDays,
      },
      achievements: {
        title: "الإنجازات",
        body: "أثر موثق، ومساهمات تستحق أن تُروى.",
        empty: "كل إنجاز يبدأ بمساهمة حقيقية",
        icon: Sparkles,
      },
      knowledge: {
        title: "المعرفة",
        body: "خبرات الفريق، محفوظة لمن يكمل الرحلة.",
        empty: "مساحة المعرفة تنتظر أول خبرة",
        icon: BookOpen,
      },
      governance: {
        title: "الحوكمة والأدلة",
        body: "من الهدف إلى القياس، والقرار الموثق. المرحلة الرابعة.",
        empty: "لن يُفتح مسار الحوكمة حتى تُنشأ أهداف ولجان ضمن نطاقك",
        icon: ShieldCheck,
      },
    };
    const entry = entries[section];
    if (!entry || slug.length > 1) notFound();
    content = (
      <>
        <Heading label="مساحات المقر" title={entry.title} body={entry.body} />
        {section === "work" && (
          <div className="work-map">
            <span>مهامي</span>
            <span>الطلبات</span>
            <span>الاجتماعات</span>
            <span>التقارير</span>
          </div>
        )}
        <section className="panel">
          <Empty
            icon={entry.icon}
            title={entry.empty}
            body="هذه مساحة تأسيسية. ستتاح إجراءاتها بعد اكتمال خدماتها وصلاحياتها، ولن تُعرض بيانات أو نتائج افتراضية."
          />
        </section>
      </>
    );
  }
  return (
    <Shell
      name={ctx.user.name}
      admin={data.admin}
      supervisor={data.supervisor}
      term={data.terms[0]?.name}
      demo={process.env.PGLITE_DIR?.startsWith(".data/e2e-")}
      createKinds={createKinds}
      contextCommittee={section === "committees" ? slug[1] : query.committee}
    >
      {content}
    </Shell>
  );
}