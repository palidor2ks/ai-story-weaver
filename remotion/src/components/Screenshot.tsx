import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors, grotesk, inter } from "../theme";

interface Props {
  src: string;            // file in public/screens
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  // ken-burns
  zoomFrom?: number;
  zoomTo?: number;
  panFromY?: number;      // % of image height to translate at start
  panToY?: number;
  panFromX?: number;
  panToX?: number;
  // caption side
  captionSide?: "left" | "right";
}

export const Screenshot: React.FC<Props> = ({
  src, eyebrow, title, sub,
  zoomFrom = 1.05, zoomTo = 1.15,
  panFromY = 0, panToY = 0,
  panFromX = 0, panToX = 0,
  captionSide = "left",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = interpolate(frame, [0, durationInFrames], [0, 1]);
  const scale = interpolate(t, [0, 1], [zoomFrom, zoomTo]);
  const tx = interpolate(t, [0, 1], [panFromX, panToX]);
  const ty = interpolate(t, [0, 1], [panFromY, panToY]);

  const captionIn = spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 120 } });
  const browserIn = spring({ frame, fps, config: { damping: 22, stiffness: 90 } });

  return (
    <AbsoluteFill style={{ padding: 80, display: "flex", flexDirection: captionSide === "left" ? "row" : "row-reverse", alignItems: "center", gap: 60 }}>
      {/* Caption */}
      <div style={{
        flex: "0 0 520px",
        opacity: captionIn,
        transform: `translateX(${interpolate(captionIn, [0, 1], [captionSide === "left" ? -40 : 40, 0])}px)`,
      }}>
        <div style={{ fontFamily: inter, fontSize: 16, color: colors.primaryGlow, letterSpacing: 6, marginBottom: 16 }}>{eyebrow}</div>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 64, lineHeight: 1.05, color: colors.ink, letterSpacing: -1.5 }}>{title}</div>
        {sub && <div style={{ fontFamily: inter, fontSize: 22, lineHeight: 1.5, color: colors.muted, marginTop: 24, maxWidth: 480 }}>{sub}</div>}
      </div>

      {/* Browser frame */}
      <div style={{
        flex: 1,
        aspectRatio: "16 / 10",
        borderRadius: 18,
        overflow: "hidden",
        background: colors.card,
        border: `1px solid ${colors.border}`,
        boxShadow: "0 40px 100px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(96,165,250,0.15)",
        transform: `scale(${interpolate(browserIn, [0, 1], [0.94, 1])}) translateY(${interpolate(browserIn, [0, 1], [30, 0])}px)`,
        opacity: browserIn,
      }}>
        {/* Title bar */}
        <div style={{ height: 36, background: "#0A1426", display: "flex", alignItems: "center", padding: "0 16px", gap: 8, borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#EF4444" }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#F59E0B" }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#10B981" }} />
          <div style={{ marginLeft: 16, fontFamily: inter, fontSize: 12, color: colors.muted, letterSpacing: 1 }}>polipulseapp.com</div>
        </div>
        {/* Image */}
        <div style={{ position: "relative", width: "100%", height: "calc(100% - 36px)", overflow: "hidden", background: "#fff" }}>
          <Img
            src={staticFile(`screens/${src}`)}
            style={{
              position: "absolute",
              top: 0, left: 0,
              width: "100%",
              transformOrigin: "center top",
              transform: `translate(${tx}%, ${ty}%) scale(${scale})`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
