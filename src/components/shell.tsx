"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  House,
  Inbox,
  Layers3,
  CalendarDays,
  Users,
  Landmark,
  Award,
  BookOpen,
  Settings2,
  Search,
  Moon,
  Sun,
  LogOut,
  Command,
  X,
  Menu,
  ArrowLeft,
  ShieldCheck,
  Plus,
  Bell,
  UserRound,
  Building2,
  ChartNoAxesCombined,
} from "lucide-react";
import { Brand } from "./brand";
import { authClient } from "./auth-form";
import { kindLabels, type Kind } from "@/lib/work/model";
export const navigation = [
  { href: "/", label: "الرئيسية", icon: House },
  { href: "/inbox", label: "صندوق الوارد", icon: Inbox },
  { href: "/work", label: "العمل", icon: Layers3 },
  { href: "/events", label: "الفعاليات", icon: CalendarDays },
  { href: "/committees", label: "اللجان", icon: Users },
  { href: "/people", label: "الناس", icon: UserRound },
  { href: "/intelligence", label: "الاستخبارات", icon: ChartNoAxesCombined },
  { href: "/operations", label: "العمليات", icon: Building2 },
  { href: "/club", label: "النادي", icon: Landmark },
  { href: "/achievements", label: "الإنجازات", icon: Award },
  { href: "/knowledge", label: "المعرفة", icon: BookOpen },
  { href: "/governance", label: "الحوكمة", icon: ShieldCheck },
];
export function Shell({
  children,
  name,
  admin,
  supervisor,
  term,
  demo = false,
  createKinds = [],
  contextCommittee,
}: {
  children: React.ReactNode;
  name: string;
  admin: boolean;
  supervisor: boolean;
  term?: string;
  demo?: boolean;
  createKinds?: Kind[];
  contextCommittee?: string;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [results, setResults] = useState<
    { id: string; title: string; kind: string }[]
  >([]);
  const [searchError, setSearchError] = useState("");
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/work/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error();
        setResults(await response.json());
        setSearchError("");
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setSearchError("تعذر البحث. حاول مجددًا.");
      }
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, open]);
  const creationHref = (kind: Kind) =>
    kind === "event"
      ? "/events?create=event"
      : `/work?create=${kind}${contextCommittee ? `&committee=${encodeURIComponent(contextCommittee)}` : ""}`;
  const links = [
    ...navigation,
    ...(supervisor
      ? [{ href: "/supervisor", label: "ملخص المشرف", icon: ShieldCheck }]
      : []),
    ...(admin ? [{ href: "/admin", label: "الإدارة", icon: Settings2 }] : []),
  ];
  useEffect(() => {
    setReady(true);
    setDark(document.documentElement.dataset.theme === "dark");
    const listener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  function theme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("club-theme", next ? "dark" : "light");
  }
  async function logout() {
    const r = await authClient.signOut();
    if (r.error) setError("تعذر تسجيل الخروج. حاول مجددًا.");
    else window.location.assign("/login");
  }
  const active = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);
  return (
    <div className="app-layout" inert={!ready} aria-busy={!ready}>
      <aside className="sidebar">
        <Link href="/" className="brand-link">
          <Brand />
        </Link>
        <div className="workspace-label">
          <span className="status-dot" /> المقر الرقمي <span>مساحة النادي</span>
        </div>
        <nav aria-label="التنقل الرئيسي">
          {links.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
              className={active(n.href) ? "nav-item active" : "nav-item"}
            >
              <n.icon size={19} />
              {n.label}
              {active(n.href) && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <img src="/brand/university.png" alt="جامعة الملك خالد" />
          <span>
            شغف يجمعنا.
            <br />
            <strong>وأثر يبقى.</strong>
          </span>
        </div>
        <Link href="/profile" className="account">
          <span className="avatar">{name.slice(0, 1)}</span>
          <span>
            <strong>{name}</strong>
            <small>الملف الشخصي والأمان</small>
          </span>
          <ArrowLeft size={17} />
        </Link>
      </aside>
      <div className="app-body">
        {demo && (
          <div className="demo-banner" role="status">
            بيانات تجريبية — بيئة اختبار منفصلة عن بيانات النادي
          </div>
        )}
        <header className="topbar">
          <div className="breadcrumb">
            المقر الرقمي <span>/</span>{" "}
            <strong>
              {links.find((n) => active(n.href) && n.href !== "/")?.label ||
                (path === "/profile" ? "الملف الشخصي" : "الرئيسية")}
            </strong>
          </div>
          <div className="top-actions">
            {createKinds.length > 0 && (
              <details className="quick-create">
                <summary>
                  <Plus size={16} /> جديد
                </summary>
                <div>
                  {createKinds.map((k) => (
                    <Link
                      key={k}
                      href={creationHref(k)}
                      onClick={(e) =>
                        e.currentTarget
                          .closest("details")
                          ?.removeAttribute("open")
                      }
                    >
                      {kindLabels[k]}
                    </Link>
                  ))}
                </div>
              </details>
            )}
            <Link
              href="/notifications"
              className="icon-button"
              aria-label="التنبيهات"
            >
              <Bell size={18} />
            </Link>
            <span className="term">{term || "لم يُحدد فصل نشط"}</span>
            <button
              className="search-trigger"
              onClick={() => setOpen(true)}
              aria-label="البحث والتنقل"
            >
              <Search size={17} />
              <span>ابحث في المقر...</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button"
              onClick={theme}
              aria-label={dark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="icon-button"
              onClick={logout}
              aria-label="تسجيل الخروج"
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <main id="main" className="main-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>نادي التقنية الرقمية — جامعة الملك خالد</span>
          <span>نعمل معًا. ونصنع الفرق.</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="التنقل على الجوال">
        {navigation.slice(0, 4).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={active(n.href) ? "active" : ""}
          >
            <n.icon size={21} />
            <span>{n.label}</span>
          </Link>
        ))}
        <button onClick={() => setMobile(true)}>
          <Menu size={21} />
          <span>المزيد</span>
        </button>
      </nav>
      <Dialog.Root open={mobile} onOpenChange={setMobile}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="mobile-menu dialog" dir="rtl">
            <Dialog.Title>مساحات النادي</Dialog.Title>
            <Dialog.Description>
              انتقل إلى لجانك وملفك ومساحات النادي.
            </Dialog.Description>
            <Dialog.Close
              className="dialog-close icon-button"
              aria-label="إغلاق"
            >
              <X />
            </Dialog.Close>
            {links.slice(4).map((n) => (
              <Link
                onClick={() => setMobile(false)}
                className="nav-item"
                href={n.href}
                key={n.href}
              >
                <n.icon size={20} />
                {n.label}
              </Link>
            ))}
            <Link
              className="nav-item"
              href="/profile"
              onClick={() => setMobile(false)}
            >
              الملف الشخصي والأمان
            </Link>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="command-dialog dialog" dir="rtl">
            <Dialog.Title>
              <Command size={20} /> إلى أين تريد الانتقال؟
            </Dialog.Title>
            <Dialog.Description>
              ابحث في المساحات المتاحة لحسابك.
            </Dialog.Description>
            <Dialog.Close
              className="dialog-close icon-button"
              aria-label="إغلاق"
            >
              <X size={20} />
            </Dialog.Close>
            <label className="sr-only" htmlFor="command-search">
              البحث في المقر
            </label>
            <input
              id="command-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="اكتب اسم مساحة..."
            />
            {links
              .filter((n) => n.label.includes(query))
              .map((n) => (
                <Link
                  className="command-result"
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                >
                  <n.icon size={19} />
                  {n.label}
                  <ArrowLeft size={16} />
                </Link>
              ))}
            {query.length >= 2 && (
              <>
                <Link
                  className="command-result"
                  href={`/governance/search?q=${encodeURIComponent(query)}`}
                  onClick={() => setOpen(false)}
                >
                  <Search size={17} />
                  <span>
                    بحث الحوكمة <small>· {query}</small>
                  </span>
                  <ArrowLeft size={16} />
                </Link>
                <Link
                  className="command-result"
                  href="/governance/inbox"
                  onClick={() => setOpen(false)}
                >
                  <Inbox size={17} />
                  <span>صندوق الوارد المؤسسي</span>
                  <ArrowLeft size={16} />
                </Link>
                <Link
                  className="command-result"
                  href="/governance/executive"
                  onClick={() => setOpen(false)}
                >
                  <Landmark size={17} />
                  <span>مركز قيادة النادي</span>
                  <ArrowLeft size={16} />
                </Link>
              </>
            )}
            <Link
              className="command-result"
              href="/work"
              onClick={() => setOpen(false)}
            >
              افتح عملي <ArrowLeft size={16} />
            </Link>
            {createKinds
              .filter((k) => `إنشاء ${kindLabels[k]}`.includes(query) || !query)
              .map((k) => (
                <Link
                  key={k}
                  className="command-result"
                  href={creationHref(k)}
                  onClick={() => setOpen(false)}
                >
                  <Plus size={17} />
                  إنشاء {kindLabels[k]}
                </Link>
              ))}
            {results.map((w) => (
              <Link
                key={w.id}
                className="command-result"
                href={
                  w.kind === "event" ? `/events/${w.id}` : `/work?item=${w.id}`
                }
                onClick={() => setOpen(false)}
              >
                <Search size={16} />
                <span>
                  {w.title}
                  <small> · {kindLabels[w.kind]}</small>
                </span>
              </Link>
            ))}
            {searchError && <p role="alert">{searchError}</p>}
            {!links.some((n) => n.label.includes(query)) &&
              !results.length &&
              query.length > 1 && <p>لم نجد مساحة بهذا الاسم.</p>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
