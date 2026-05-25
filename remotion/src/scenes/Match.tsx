import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors, grotesk, inter } from "../theme";

const CANDIDATES = [
  { name: "Sen. Maria Chen", party: "D", color: colors.blue, match: 92, district: "CA · Senate" },
  { name: "Rep. James Walker", party: "I", color: "#A855F7", match: 78, district: "OR · House" },
  { name: "Gov. Elena Ruiz", party: "D", color: colors.blue, match: 71, district: "NM · Governor" },
];

const Card: React.FC<{ c: typeof CANDIDATES[number]; delay: number }> = ({ c, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 140 } });
  const count = Math.round(interpolate(spring({ frame: frame - delay - 8, fps, config: { damping: 20 } }), [0, 1], [0, c.match]));
  return (
    <div style={{
      width: 420, padding: 28, borderRadius: 20,
      background: colors.card, border: `1px solid ${colors.border}`,
      transform: `translateY(${interpolate(s, [0, 1], [80, 0])}px) scale(${interpolate(s, [0, 1], [0.9, 1])})`,
      opacity: s,
      boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
    }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 999,
          background: `linear-gradient(135deg, ${c.color}, ${c.color}88)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: grotesk, fontWeight: 700, fontSize: 26, color: "#fff",
        }}>{c.name.split(" ").slice(-1)[0][0]}</div>
        <div>
          <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 24, color: colors.ink }}>{c.name}</div>
          <div style={{ fontFamily: inter, fontSize: 15, color: colors.muted }}>{c.district}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 72, color: colors.primary, lineHeight: 1 }}>{count}</div>
        <div style={{ fontFamily: grotesk, fontWeight: 500, fontSize: 28, color: colors.primaryGlow }}>%</div>
        <div style={{ fontFamily: inter, fontSize: 14, color: colors.muted, marginLeft: 6 }}>match</div>
      </div>
      <div style={{ height: 8, background: colors.border, borderRadius: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${count}%`, background: `linear-gradient(90deg, ${colors.primary}, ${colors.primaryGlow})` }} />
      </div>
    </div>
  );
};

export const Match: React.FC = () => {
  const frame = useCurrentFrame();
  const titleIn = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40 }}>
      <div style={{ opacity: titleIn, transform: `translateY(${interpolate(titleIn, [0, 1], [20, 0])}px)`, textAlign: "center" }}>
        <div style={{ fontFamily: inter, fontSize: 18, color: colors.primary, letterSpacing: 6, marginBottom: 10 }}>YOUR TOP MATCHES</div>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 64, color: colors.ink, letterSpacing: -1 }}>Candidates who share your values.</div>
      </div>
      <div style={{ display: "flex", gap: 32 }}>
        {CANDIDATES.map((c, i) => <Card key={c.name} c={c} delay={20 + i * 8} />)}
      </div>
    </AbsoluteFill>
  );
};
