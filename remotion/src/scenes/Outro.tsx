import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors, grotesk, inter } from "../theme";

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 14, stiffness: 130 } });
  const tag = spring({ frame: frame - 14, fps, config: { damping: 18, stiffness: 130 } });
  const url = spring({ frame: frame - 28, fps, config: { damping: 18, stiffness: 130 } });
  const pulse = 1 + Math.sin(frame / 6) * 0.05;

  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 26,
        opacity: logo, transform: `scale(${interpolate(logo, [0, 1], [0.7, 1])})`,
      }}>
        <div style={{
          width: 120, height: 120, borderRadius: 32,
          background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryGlow})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 80px ${colors.primary}88`,
          transform: `scale(${pulse})`,
        }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 140, color: colors.ink, letterSpacing: -4 }}>
          Poli<span style={{ color: colors.primary }}>Pulse</span>
        </div>
      </div>

      <div style={{
        fontFamily: grotesk, fontWeight: 500, fontSize: 44, color: colors.ink, marginTop: 40,
        opacity: tag, transform: `translateY(${interpolate(tag, [0, 1], [20, 0])}px)`,
        letterSpacing: -0.5,
      }}>
        Your pulse on politics.
      </div>

      <div style={{
        fontFamily: inter, fontSize: 24, color: colors.muted, marginTop: 28, letterSpacing: 3,
        opacity: url, transform: `translateY(${interpolate(url, [0, 1], [10, 0])}px)`,
      }}>
        POLIPULSEAPP.COM
      </div>
    </AbsoluteFill>
  );
};
