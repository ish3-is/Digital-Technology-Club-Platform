"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  ChartColumnIncreasing,
  ChartNoAxesColumnIncreasing,
  ChartPie,
  CircleGauge,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";

export type CommitteePulse = {
  id: string;
  name: string;
  open: number;
  completed: number;
  review: number;
  overdue: number;
  total: number;
};

export type MonthlyRecognition = {
  name: string;
  detail: string;
  count: number;
} | null;

type ChartView = "bars" | "donut" | "columns";

const chartViews: {
  id: ChartView;
  label: string;
  icon: typeof ChartColumnIncreasing;
}[] = [
  { id: "bars", label: "أشرطة", icon: ChartNoAxesColumnIncreasing },
  { id: "donut", label: "دائرة", icon: ChartPie },
  { id: "columns", label: "أعمدة", icon: ChartColumnIncreasing },
];

function DonutChart({ rows }: { rows: CommitteePulse[] }) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const svg = el.querySelector("svg");
    if (!svg) return;
    svg.replaceChildren();

    const root = document.documentElement;
    const token = (name: string) =>
      getComputedStyle(root).getPropertyValue(name).trim();
    const colors = rows.map(
      (_, index) =>
        getComputedStyle(el)
          .getPropertyValue(`--pulse-color-${(index % 5) + 1}`)
          .trim() || "#6e2dbd",
    );
    const viewBox = svg.viewBox.baseVal;
    const cx = viewBox.width / 2;
    const cy = viewBox.height / 2;
    const outer = Math.min(cx, cy);
    const inner = outer - (Number(el.dataset.thickness) || 22);

    const point = (radius: number, angle: number) =>
      `${(cx + radius * Math.sin(angle)).toFixed(3)} ${(cy - radius * Math.cos(angle)).toFixed(3)}`;
    const ringPath = (
      a0: number,
      a1: number,
      gap: number,
      corner: number,
    ) => {
      const ro = outer - corner;
      const ri = inner + corner;
      const inset = gap / 2 + corner;
      if (ro <= ri) return "";
      const outerGap = Math.asin(Math.min(1, inset / ro));
      const innerGap = Math.asin(Math.min(1, inset / ri));
      const o0 = a0 + outerGap;
      const o1 = a1 - outerGap;
      const i0 = a0 + innerGap;
      const i1 = a1 - innerGap;
      if (i1 - i0 <= 0 || o1 - o0 <= 0) return "";
      const largeOuter = o1 - o0 > Math.PI ? 1 : 0;
      const largeInner = i1 - i0 > Math.PI ? 1 : 0;
      return `M${point(ro, o0)}A${ro} ${ro} 0 ${largeOuter} 1 ${point(ro, o1)}L${point(ri, i1)}A${ri} ${ri} 0 ${largeInner} 0 ${point(ri, i0)}Z`;
    };

    const segments = colors.map((color) => {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("class", "t-donut-seg");
      path.style.fill = color;
      path.style.stroke = color;
      svg.appendChild(path);
      return path;
    });
    const values = rows.map((row) => row.open);
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const gap = Number.parseFloat(token("--chart-gap")) || 0;
    const corner = Number.parseFloat(token("--chart-corner")) || 0;
    let angle = 0;
    values.forEach((value, index) => {
      const span = (value / total) * Math.PI * 2;
      segments[index].setAttribute(
        "d",
        ringPath(angle, angle + span, gap, corner),
      );
      segments[index].style.strokeWidth = String(2 * corner);
      angle += span;
    });
  }, [rows]);

  const total = rows.reduce((sum, row) => sum + row.open, 0);
  return (
    <div className="pulse-donut-layout">
      <div className="t-donut pulse-donut" data-thickness="22" ref={chartRef}>
        <svg viewBox="0 0 180 180" aria-hidden="true" />
        <div className="t-donut-center">
          <strong>{total.toLocaleString("ar-SA")}</strong>
          <span>عمل مفتوح</span>
        </div>
      </div>
      <div className="pulse-legend" aria-label="مفتاح الرسم الدائري">
        {rows.map((row, index) => (
          <div key={row.id}>
            <i data-color={(index % 5) + 1} />
            <span>{row.name}</span>
            <strong>{row.open.toLocaleString("ar-SA")}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecognitionCard({
  kind,
  recognition,
  month,
  fullScope,
}: {
  kind: "member" | "committee";
  recognition: MonthlyRecognition;
  month: string;
  fullScope: boolean;
}) {
  const member = kind === "member";
  const Icon = member ? Star : Trophy;
  return (
    <article className={`recognition-card ${member ? "member" : "committee"}`}>
      <div className="recognition-stars" aria-hidden="true">
        <Sparkles size={20} />
        <Star size={14} />
        <Star size={9} />
      </div>
      <span className="recognition-icon">
        <Icon size={26} />
      </span>
      <div>
        <p>{member ? "نجم الشهر" : "لجنة الشهر"} · {month}</p>
        {recognition ? (
          <>
            <h3>{recognition.name}</h3>
            <span>{recognition.detail}</span>
            <small>
              {recognition.count.toLocaleString("ar-SA")}{" "}
              {member ? "أعمال مكتملة بمسؤولية مباشرة" : "أعمال مكتملة"}
            </small>
          </>
        ) : (
          <>
            <h3>{fullScope ? "بانتظار بيانات مكتملة" : "تقدير الإدارة"}</h3>
            <span>
              {fullScope
                ? "يظهر التقدير بعد اكتمال أعمال موثقة خلال الشهر."
                : "يظهر الاسم بعد احتسابه واعتماده ضمن النطاق الكامل للنادي."}
            </span>
          </>
        )}
      </div>
      <Award className="recognition-seal" size={58} aria-hidden="true" />
    </article>
  );
}

export function ClubPulseDashboard({
  rows,
  memberStar,
  committeeStar,
  month,
  demo,
  fullScope,
}: {
  rows: CommitteePulse[];
  memberStar: MonthlyRecognition;
  committeeStar: MonthlyRecognition;
  month: string;
  demo: boolean;
  fullScope: boolean;
}) {
  const [view, setView] = useState<ChartView>("bars");
  const tabsRef = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...rows.map((row) => row.open));
  const totals = useMemo(
    () =>
      rows.reduce(
        (result, row) => ({
          open: result.open + row.open,
          completed: result.completed + row.completed,
          review: result.review + row.review,
          overdue: result.overdue + row.overdue,
        }),
        { open: 0, completed: 0, review: 0, overdue: 0 },
      ),
    [rows],
  );

  useEffect(() => {
    const bar = tabsRef.current;
    if (!bar) return;
    const pill = bar.querySelector<HTMLElement>(".t-tabs-pill");
    const tabs = [...bar.querySelectorAll<HTMLButtonElement>(".t-tab")];
    if (!pill) return;
    const moveTo = (tab: HTMLButtonElement, animate: boolean) => {
      if (!animate) {
        const previous = pill.style.transition;
        pill.style.transition = "none";
        pill.style.transform = `translateX(${tab.offsetLeft}px)`;
        pill.style.width = `${tab.offsetWidth}px`;
        void pill.offsetWidth;
        pill.style.transition = previous;
      } else {
        pill.style.transform = `translateX(${tab.offsetLeft}px)`;
        pill.style.width = `${tab.offsetWidth}px`;
      }
    };
    const active = tabs.find(
      (tab) => tab.getAttribute("aria-selected") === "true",
    );
    if (active) requestAnimationFrame(() => moveTo(active, false));
    const resize = () => {
      const selected = tabs.find(
        (tab) => tab.getAttribute("aria-selected") === "true",
      );
      if (selected) moveTo(selected, false);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <section className="club-pulse-dashboard" aria-labelledby="club-pulse-title">
      <div className="pulse-dashboard-head">
        <div>
          <h2 id="club-pulse-title">
            <CircleGauge size={24} /> نبض النادي
          </h2>
          <p>
            الأعمال المفتوحة حسب اللجنة، من السجلات المتاحة لصلاحياتك.
            {demo && " هذه بيانات العرض التجريبي."}
          </p>
        </div>
        <div className="t-tabs pulse-view-tabs" role="tablist" ref={tabsRef} aria-label="نوع الرسم البياني">
          <span className="t-tabs-pill" aria-hidden="true" />
          {chartViews.map((item) => (
            <button
              className="t-tab"
              type="button"
              role="tab"
              aria-selected={view === item.id}
              key={item.id}
              onClick={(event) => {
                const bar = tabsRef.current;
                const pill = bar?.querySelector<HTMLElement>(".t-tabs-pill");
                if (pill) {
                  pill.style.transform = `translateX(${event.currentTarget.offsetLeft}px)`;
                  pill.style.width = `${event.currentTarget.offsetWidth}px`;
                }
                setView(item.id);
              }}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pulse-summary" aria-label="ملخص حالات العمل">
        <span><b>{totals.open.toLocaleString("ar-SA")}</b> مفتوحة</span>
        <span><b>{totals.completed.toLocaleString("ar-SA")}</b> مكتملة</span>
        <span><b>{totals.review.toLocaleString("ar-SA")}</b> للمراجعة</span>
        <span className={totals.overdue ? "has-risk" : ""}>
          <b>{totals.overdue.toLocaleString("ar-SA")}</b> متأخرة
        </span>
      </div>

      <div className="pulse-chart-stage" data-view={view} role="tabpanel" key={view}>
        {rows.length === 0 ? (
          <div className="pulse-no-data">
            <ChartNoAxesColumnIncreasing size={31} />
            <h3>لا توجد أعمال قابلة للرسم الآن</h3>
            <p>سيظهر الرسم تلقائيًا عند إضافة أعمال مرتبطة باللجان.</p>
          </div>
        ) : view === "bars" ? (
          <div className="pulse-bars" aria-label="رسم أشرطة للأعمال المفتوحة">
            {rows.map((row) => (
              <div className="pulse-bar-row" key={row.id}>
                <div>
                  <strong>{row.name}</strong>
                  <span>{row.open.toLocaleString("ar-SA")} مفتوحة</span>
                </div>
                <span className="pulse-bar-track">
                  <i style={{ width: `${(row.open / max) * 100}%` }} />
                </span>
                <b>{row.open.toLocaleString("ar-SA")}</b>
              </div>
            ))}
          </div>
        ) : view === "donut" ? (
          <DonutChart rows={rows} />
        ) : (
          <div className="pulse-columns" aria-label="رسم أعمدة للأعمال المفتوحة">
            {rows.map((row, index) => (
              <div className="pulse-column" key={row.id}>
                <div className="pulse-column-value">
                  {row.open.toLocaleString("ar-SA")}
                </div>
                <span>
                  <i
                    data-color={(index % 5) + 1}
                    style={{ height: `${Math.max(8, (row.open / max) * 100)}%` }}
                  />
                </span>
                <strong>{row.name.replace("لجنة ", "")}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="monthly-recognition">
        <RecognitionCard kind="member" recognition={memberStar} month={month} fullScope={fullScope} />
        <RecognitionCard kind="committee" recognition={committeeStar} month={month} fullScope={fullScope} />
      </div>
      <p className="recognition-method">
        التقدير الشهري إشادة لا ترتيب: يُحتسب من الأعمال المكتملة فعليًا خلال الشهر، وعند التعادل يُستخدم الاسم للفصل فقط. لا تُعرض قائمة تنافسية.
      </p>
    </section>
  );
}
