import Image from "next/image";

export function MadarMark({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={compact ? "madar-mark compact" : "madar-mark"}
      href="https://ish3-is.github.io/MDR/"
      target="_blank"
      rel="noreferrer"
      aria-label="زيارة موقع مدار — يفتح في نافذة جديدة"
    >
      <Image
        src="/brand/madar-academy.png"
        width={compact ? 34 : 46}
        height={compact ? 34 : 46}
        alt="مدار أكاديمي"
        loading="eager"
      />
      <span>
        <small>إحدى أعمال</small>
        <strong>مدار</strong>
      </span>
    </a>
  );
}
