export function Brand({ primary = false }: { primary?: boolean }) {
  return primary ? (
    <img
      className="brand-primary"
      src="/brand/club-primary.png"
      alt="نادي التقنية الرقمية"
    />
  ) : (
    <span className="brand">
      <img
        className="brand-on-light"
        src="/brand/club-dark.png"
        alt="نادي التقنية الرقمية"
      />
      <img
        className="brand-on-dark"
        src="/brand/club-light.png"
        alt="نادي التقنية الرقمية"
      />
    </span>
  );
}
