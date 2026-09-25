// Shared artwork for the generated app icons: a marquee-gold "W" on a warm near-black tile.
export function AppIconArt({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#16120f",
        color: "#f0b54a",
        fontSize: size * 0.62,
        fontWeight: 800,
        fontFamily: "serif",
      }}
    >
      W
    </div>
  );
}
