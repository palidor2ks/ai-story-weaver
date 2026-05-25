import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors, grotesk, inter } from "../theme";

const STOPS = [-10, -5, 0, 5, 10];
const LABELS = ["Strongly\nDisagree", "Disagree", "Neutral", "Agree", "Strongly\nAgree"];

export const Quiz: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardIn = spring({ frame, fps, config: { damping: 18, stiffness: 140 } });
  // Snap sequence: index advances at frames 25, 40, 55
  const idx = frame < 25 ? 2 : frame < 40 ? 3 : 4;
  const snap = spring({ frame: frame - (idx === 3 ? 25 : idx === 4 ? 40 : 0), fps, config: { damping: 12, stiffness: 200 } });
  const knobPos = STOPS.indexOf([0, 0, 0, 5, 10][Math.min(idx, 4)]);
  const prevKnob = idx === 2 ? 2 : idx === 3 ? 2 : 3;
  const knobX = interpolate(snap, [0, 1], [prevKnob, knobPos]);

  return (
    <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        width: 1100, padding: 56, borderRadius: 28,
        background: colors.card, border: `1px solid ${colors.border}`,
        boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        transform: `translateY(${interpolate(cardIn, [0, 1], [60, 0])}px) scale(${interpolate(cardIn, [0, 1], [0.92, 1])})`,
        opacity: cardIn,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: inter, fontSize: 18, color: colors.primary, letterSpacing: 2 }}>
            QUESTION 7 / 20 · ENVIRONMENT
          </div>
          <div style={{ fontFamily: inter, fontSize: 16, color: colors.muted }}>2-minute quiz</div>
        </div>
        <div style={{ fontFamily: grotesk, fontWeight: 500, fontSize: 56, color: colors.ink, lineHeight: 1.15, marginBottom: 56 }}>
          Should the U.S. invest more in renewable energy?
        </div>

        <div style={{ position: "relative", height: 80, marginBottom: 16 }}>
          <div style={{
            position: "absolute", top: 36, left: 0, right: 0, height: 8,
            background: colors.border, borderRadius: 8,
          }} />
          <div style={{
            position: "absolute", top: 36, left: 0, height: 8, borderRadius: 8,
            width: `${(knobX / 4) * 100}%`,
            background: `linear-gradient(90deg, ${colors.primary}, ${colors.primaryGlow})`,
          }} />
          {STOPS.map((_, i) => (
            <div key={i} style={{
              position: "absolute", left: `${(i / 4) * 100}%`, top: 30, transform: "translateX(-50%)",
              width: 20, height: 20, borderRadius: 999,
              background: i <= Math.round(knobX) ? colors.primary : colors.border,
              border: `3px solid ${colors.bg2}`,
            }} />
          ))}
          <div style={{
            position: "absolute", left: `${(knobX / 4) * 100}%`, top: 16, transform: "translateX(-50%)",
            width: 48, height: 48, borderRadius: 999,
            background: "#fff",
            boxShadow: `0 0 0 6px ${colors.primary}55, 0 10px 24px rgba(0,0,0,0.5)`,
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: inter, fontSize: 14, color: colors.muted, whiteSpace: "pre-line", textAlign: "center" }}>
          {LABELS.map((l, i) => <div key={i} style={{ width: 100, color: i === Math.round(knobX) ? colors.primary : colors.muted, fontWeight: i === Math.round(knobX) ? 600 : 400 }}>{l}</div>)}
        </div>
      </div>
    </AbsoluteFill>
  );
};
