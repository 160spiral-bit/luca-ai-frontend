// Brand spark: main flare + small satellite spark, static. (An animated
// twinkle variant existed but was never enabled anywhere and referenced CSS
// classes that do not exist, so it was removed rather than shipped dead.)
export default function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: "visible" }} aria-hidden="true">
      <path
        fill="currentColor"
        style={{ opacity: 0.85 }}
        d="M12 3c.3 2.8 1 4.7 2.1 5.9C15.3 10 17.2 10.7 20 11c-2.8.3-4.7 1-5.9 2.1C12.9 14.3 12.2 16.2 12 19c-.3-2.8-1-4.7-2.1-5.9C8.7 12 6.8 11.3 4 11c2.8-.3 4.7-1 5.9-2.1C11 7.7 11.7 5.8 12 3z"
      />
      <path
        fill="currentColor"
        opacity="0.5"
        d="M19 2c.15 1.3.5 2.2 1 2.7.5.5 1.4.85 2.7 1-1.3.15-2.2.5-2.7 1-.5.5-.85 1.4-1 2.7-.15-1.3-.5-2.2-1-2.7C17.5 6.2 16.6 5.85 15.3 5.7c1.3-.15 2.2-.5 2.7-1 .5-.5.85-1.4 1-2.7z"
      />
    </svg>
  );
}
