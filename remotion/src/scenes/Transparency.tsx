import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors, grotesk, inter } from "../theme";

const VOTES = [
  { bill: "H.R. 1 · Voting Rights Act", pos: "YEA", color: colors.green },
  { bill: "H.R. 5376 · Climate Investment", pos: "YEA", color: colors.green },
  { bill: "S. 2226 · Defense Authorization", pos: "NAY", color: colors.red },
  { bill: "H.R. 2 · Border Security", pos: "NAY", color: colors.red },
];

const DONORS = [
  { name: "Individual Donors", pct: 68, color: colors.primary },
  { name: "Small PACs", pct: 18, color: colors.primaryGlow },
  { name: "Industry Groups", pct: 9, color: "#A855F7" },
  { name: "Self-Funding", pct: 5, color: colors.muted },
];

export const Transparency: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ padding: 80 }}>
      <div style={{ opacity: titleIn, transform: `translateY(${interpolate(titleIn, [0, 1], [20, 0])}px)`, textAlign: "center", marginBottom: 50 }}>
        <div style={{ fontFamily: inter, fontSize: 18, color: colors.primary, letterSpacing: 6, marginBottom: 10 }}>BACKED BY EVIDENCE</div>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 60, color: colors.ink, letterSpacing: -1 }}>
          Voting records. <span style={{ color: colors.primary }}>Donor data.</span> Real receipts.
        </div>
      </div>

      <div style={{ display: "flex", gap: 40, flex: 1 }}>
        {/* Voting record panel */}
        <div style={{ flex: 1, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 20, padding: 32 }}>
          <div style={{ fontFamily: inter, fontSize: 14, color: colors.muted, letterSpacing: 3, marginBottom: 20 }}>VOTING RECORD · 119TH CONGRESS</div>
          {VOTES.map((v, i) => {
            const delay = 18 + i * 7;
            const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 160 } });
            return (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "18px 0", borderBottom: `1px solid ${colors.border}`,
                opacity: s, transform: `translateX(${interpolate(s, [0, 1], [-30, 0])}px)`,
              }}>
                <div style={{ fontFamily: inter, fontSize: 22, color: colors.ink }}>{v.bill}</div>
                <div style={{
                  fontFamily: grotesk, fontWeight: 700, fontSize: 16, letterSpacing: 2,
                  background: `${v.color}22`, color: v.color, padding: "8px 16px", borderRadius: 8,
                }}>{v.pos}</div>
              </div>
            );
          })}
        </div>

        {/* Donor breakdown */}
        <div style={{ flex: 1, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 20, padding: 32 }}>
          <div style={{ fontFamily: inter, fontSize: 14, color: colors.muted, letterSpacing: 3, marginBottom: 24 }}>FUNDING SOURCES · 2024 CYCLE</div>
          {DONORS.map((d, i) => {
            const delay = 22 + i * 8;
            const s = spring({ frame: frame - delay, fps, config: { damping: 22, stiffness: 120 } });
            const w = interpolate(s, [0, 1], [0, d.pct]);
            return (
              <div key={i} style={{ marginBottom: 24, opacity: interpolate(s, [0, 0.3], [0, 1]) }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontFamily: inter, fontSize: 20, color: colors.ink }}>{d.name}</div>
                  <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 22, color: d.color }}>{Math.round(w)}%</div>
                </div>
                <div style={{ height: 14, background: colors.border, borderRadius: 7, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${w}%`, background: `linear-gradient(90deg, ${d.color}, ${d.color}cc)`, borderRadius: 7 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
