import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors, grotesk, inter } from "../theme";

export const Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame, fps, config: { damping: 22, stiffness: 80 } });
  const b = spring({ frame: frame - 18, fps, config: { damping: 22, stiffness: 80 } });
  const c = spring({ frame: frame - 36, fps, config: { damping: 22, stiffness: 80 } });
  const d = spring({ frame: frame - 70, fps, config: { damping: 20, stiffness: 100 } });

  const items = [
    { label: "Know your representatives.", v: a, color: colors.primaryGlow },
    { label: "Follow the money.", v: b, color: colors.green },
    { label: "Cast a smarter vote.", v: c, color: colors.red },
  ];

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ fontFamily: inter, fontSize: 18, color: colors.primary, letterSpacing: 8, marginBottom: 30, opacity: a }}>
        NO SPIN · NO VIBES · JUST RECEIPTS
      </div>
      <div style={{ textAlign: "center", maxWidth: 1400 }}>
        {items.map((it, i) => (
          <div key={i} style={{
            fontFamily: grotesk, fontWeight: 700, fontSize: 88, lineHeight: 1.1, letterSpacing: -2,
            color: it.color, opacity: it.v, transform: `translateY(${interpolate(it.v, [0, 1], [40, 0])}px)`,
            marginBottom: 8,
          }}>{it.label}</div>
        ))}
      </div>
      <div style={{
        marginTop: 60, opacity: d, transform: `scale(${interpolate(d, [0, 1], [0.85, 1])})`,
        fontFamily: grotesk, fontWeight: 700, fontSize: 120, letterSpacing: -4,
        background: `linear-gradient(120deg, ${colors.primaryGlow}, #fff 40%, ${colors.red})`,
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      }}>
        polipulseapp.com
      </div>
    </AbsoluteFill>
  );
};
