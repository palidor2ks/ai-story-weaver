import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors, grotesk, inter } from "../theme";

const HEADLINES = [
  "BREAKING: Senate deadlocked again",
  "Poll shows voters confused",
  "Attack ad spending hits record",
  "Politician flips position",
  "Misinformation spreads online",
  "Lobbyists outspend voters 10 to 1",
];

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const collapse = spring({ frame: frame - 35, fps, config: { damping: 18, stiffness: 120 } });
  const headlineOpacity = interpolate(collapse, [0, 1], [1, 0]);
  const headlineBlur = interpolate(collapse, [0, 1], [0, 14]);
  const titleIn = spring({ frame: frame - 42, fps, config: { damping: 14, stiffness: 130 } });

  return (
    <AbsoluteFill>
      {HEADLINES.map((h, i) => {
        const delay = i * 3;
        const slide = interpolate(frame - delay, [0, 14], [120, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
        const op = interpolate(frame - delay, [0, 10], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
        const y = 140 + i * 110;
        const x = i % 2 === 0 ? 120 : 760;
        return (
          <div key={i} style={{
            position: "absolute", top: y, left: x,
            transform: `translateX(${slide}px) scale(${1 - collapse * 0.3})`,
            opacity: op * headlineOpacity,
            filter: `blur(${headlineBlur}px)`,
            background: colors.card, border: `1px solid ${colors.border}`,
            borderRadius: 12, padding: "16px 22px",
            fontFamily: inter, fontSize: 26, color: colors.ink,
            display: "flex", alignItems: "center", gap: 14,
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: i % 3 === 0 ? colors.red : colors.muted }} />
            {h}
          </div>
        );
      })}

      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        opacity: titleIn,
      }}>
        <div style={{ textAlign: "center", transform: `scale(${0.85 + titleIn * 0.15})` }}>
          <div style={{ fontFamily: inter, fontSize: 22, color: colors.muted, letterSpacing: 8, marginBottom: 14 }}>
            POLITICS IS NOISY.
          </div>
          <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 140, color: colors.ink, letterSpacing: -3, lineHeight: 1 }}>
            We cut <span style={{ color: colors.primary }}>through</span>.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
