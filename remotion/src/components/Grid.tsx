import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors } from "../theme";

export const Grid = () => {
  const frame = useCurrentFrame();
  const shift = interpolate(frame, [0, 450], [0, 80]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 30% 20%, #13203A 0%, ${colors.bg} 60%, #060B16 100%)` }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        <defs>
          <pattern id="g" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform={`translate(${shift} ${shift})`}>
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke={colors.border} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
      </svg>
      <div style={{
        position: "absolute", top: "-20%", left: "60%", width: 900, height: 900,
        background: `radial-gradient(circle, ${colors.primary}33 0%, transparent 60%)`,
        filter: "blur(40px)",
      }} />
    </AbsoluteFill>
  );
};
