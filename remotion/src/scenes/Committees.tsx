import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors, grotesk, inter } from "../theme";

export const Committees: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = interpolate(frame, [0, durationInFrames], [0, 1]);
  const intro = spring({ frame, fps, config: { damping: 22, stiffness: 90 } });
  const swap = interpolate(frame, [durationInFrames * 0.45, durationInFrames * 0.55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const browserStyle: React.CSSProperties = {
    position: "absolute",
    width: "55%",
    aspectRatio: "16 / 10",
    borderRadius: 18,
    overflow: "hidden",
    background: colors.card,
    border: `1px solid ${colors.border}`,
    boxShadow: "0 40px 100px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(96,165,250,0.15)",
  };

  const titleBar = (
    <div style={{ height: 32, background: "#0A1426", display: "flex", alignItems: "center", padding: "0 14px", gap: 6, borderBottom: `1px solid ${colors.border}` }}>
      <div style={{ width: 10, height: 10, borderRadius: 5, background: "#EF4444" }} />
      <div style={{ width: 10, height: 10, borderRadius: 5, background: "#F59E0B" }} />
      <div style={{ width: 10, height: 10, borderRadius: 5, background: "#10B981" }} />
    </div>
  );

  const scaleA = interpolate(t, [0, 1], [1.0, 1.1]);
  const tyA = interpolate(t, [0, 1], [0, -8]);

  return (
    <AbsoluteFill style={{ padding: 80 }}>
      {/* Headline */}
      <div style={{
        opacity: intro,
        transform: `translateY(${interpolate(intro, [0, 1], [20, 0])}px)`,
        textAlign: "center", marginBottom: 30,
      }}>
        <div style={{ fontFamily: inter, fontSize: 16, color: colors.primaryGlow, letterSpacing: 6, marginBottom: 14 }}>COMMITTEES & OUTSIDE SPENDERS</div>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 60, color: colors.ink, letterSpacing: -1.2 }}>
          The biggest <span style={{ color: colors.green }}>raisers</span>. The biggest <span style={{ color: colors.red }}>spenders</span>.
        </div>
      </div>

      {/* Two browser frames overlapping */}
      <div style={{ position: "relative", flex: 1 }}>
        <div style={{ ...browserStyle, top: 20, left: "2%", transform: `scale(${intro}) translateY(${interpolate(intro, [0, 1], [40, 0])}px)`, opacity: 1 - swap * 0.4 }}>
          {titleBar}
          <div style={{ position: "relative", width: "100%", height: "calc(100% - 32px)", overflow: "hidden", background: "#fff" }}>
            <Img src={staticFile("screens/committees.png")} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${tyA}%) scale(${scaleA})`, transformOrigin: "center top" }} />
          </div>
        </div>
        <div style={{ ...browserStyle, top: 80, right: "2%", transform: `scale(${interpolate(intro, [0, 1], [0.9, 1])}) translateY(${interpolate(intro, [0, 1], [40, 0])}px)`, opacity: 0.6 + swap * 0.4, zIndex: 2 }}>
          {titleBar}
          <div style={{ position: "relative", width: "100%", height: "calc(100% - 32px)", overflow: "hidden", background: "#fff" }}>
            <Img src={staticFile("screens/spenders.png")} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${tyA}%) scale(${scaleA})`, transformOrigin: "center top" }} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
