import { CSSProperties } from 'react';

interface Props {
  size?: number;
  /** Frame background when icon fails / for visual contrast on dark cards */
  framed?: boolean;
  /** Frame background color (defaults to translucent white) */
  frameColor?: string;
  style?: CSSProperties;
}

/**
 * Renders the Pulse app icon (public/icon-512.png). Same-origin so safe for
 * html-to-image. Falls back to a "P" glyph in a rounded square if the image
 * isn't available.
 */
export const PulseMark = ({ size = 56, framed = false, frameColor, style }: Props) => {
  const radius = Math.round(size * 0.22);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: framed ? frameColor ?? 'rgba(255,255,255,0.18)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        ...style,
      }}
    >
      <img
        src="/icon-512.png"
        alt="Pulse"
        crossOrigin="anonymous"
        width={size}
        height={size}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </div>
  );
};
