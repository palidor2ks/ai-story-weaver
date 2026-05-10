import { forwardRef } from 'react';
import { CardData, CARD_SIZE, formatScoreSafe, labelSafe } from './types';
import { PulseMark } from './PulseMark';

interface Props {
  data: CardData;
}

/**
 * BOLD — Maximum scroll-stopper.
 * Huge score glyph on a primary gradient, name underneath.
 */
export const BoldCard = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const isCandidate = data.kind === 'candidate-alignment';
  const isInvite = data.kind === 'invite';
  const score = isCandidate ? data.matchScore ?? 0 : data.userScore ?? 0;
  const display = isCandidate
    ? `${data.matchScore ?? 0}%`
    : isInvite
    ? 'Pulse'
    : formatScoreSafe(data.userScore);
  const subtitle = isCandidate
    ? `aligned with ${data.candidateName}`
    : isInvite
    ? 'Find your political pulse'
    : labelSafe(data.userScore);

  return (
    <div
      ref={ref}
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        background:
          'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
        color: 'hsl(var(--primary-foreground))',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 80,
        fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
        overflow: 'hidden',
      }}
    >
      {/* Large soft circle accents */}
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          top: -200,
          right: -200,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.10)',
          bottom: -180,
          left: -120,
        }}
      />

      {/* Top: brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
        <PulseMark size={72} framed frameColor="rgba(255,255,255,0.18)" />
        <div style={{ fontWeight: 700, fontSize: 32, letterSpacing: -0.5 }}>Pulse</div>
      </div>

      {/* Center: huge glyph */}
      <div style={{ position: 'relative', textAlign: 'left' }}>
        <div
          style={{
            fontSize: isCandidate ? 320 : 260,
            fontWeight: 900,
            lineHeight: 0.9,
            letterSpacing: -8,
          }}
        >
          {display}
        </div>
        <div style={{ fontSize: 44, fontWeight: 600, marginTop: 24, opacity: 0.95 }}>
          {subtitle}
        </div>
        {isCandidate && (
          <div style={{ fontSize: 28, marginTop: 12, opacity: 0.8 }}>
            {data.candidateOffice} · {data.candidateParty}
          </div>
        )}
      </div>

      {/* Bottom: URL */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          position: 'relative',
        }}
      >
        <div style={{ fontSize: 24, opacity: 0.85 }}>
          {isCandidate
            ? `My position: ${formatScoreSafe(data.candidateScore !== undefined ? (isCandidate ? data.candidateScore : null) : null)}`
            : 'Take the quiz'}
        </div>
        <div style={{ fontSize: 24, fontWeight: 600 }}>{data.brandHost}</div>
      </div>
    </div>
  );
});
BoldCard.displayName = 'BoldCard';
