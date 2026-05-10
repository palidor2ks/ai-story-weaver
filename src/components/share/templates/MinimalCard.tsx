import { forwardRef } from 'react';
import { CardData, CARD_SIZE, formatScoreSafe, labelSafe } from './types';

interface Props {
  data: CardData;
}

/**
 * MINIMAL — Editorial calm.
 * Off-white card, thin display type, hairline divider.
 */
export const MinimalCard = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const isCandidate = data.kind === 'candidate-alignment';
  const isInvite = data.kind === 'invite';
  const headline = isCandidate
    ? `${data.matchScore}% aligned`
    : isInvite
    ? 'Where do you stand?'
    : formatScoreSafe(data.userScore);
  const sub = isCandidate
    ? `with ${data.candidateName}`
    : isInvite
    ? 'Take the Pulse alignment quiz'
    : labelSafe(data.userScore);

  return (
    <div
      ref={ref}
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        padding: 100,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
        position: 'relative',
        border: '1px solid hsl(var(--border))',
      }}
    >
      {/* Top */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 22,
          letterSpacing: 6,
          textTransform: 'uppercase',
          color: 'hsl(var(--muted-foreground))',
        }}
      >
        <span>Pulse</span>
        <span>{isCandidate ? 'Voter Match' : isInvite ? 'Invitation' : 'Profile'}</span>
      </div>

      {/* Center */}
      <div>
        <div
          style={{
            fontSize: isCandidate || isInvite ? 200 : 220,
            fontWeight: 200,
            lineHeight: 1,
            letterSpacing: -6,
            color: 'hsl(var(--foreground))',
          }}
        >
          {headline}
        </div>
        <div
          style={{
            height: 1,
            background: 'hsl(var(--border))',
            margin: '48px 0 36px',
            width: '100%',
          }}
        />
        <div
          style={{
            fontSize: 44,
            fontWeight: 400,
            color: 'hsl(var(--foreground))',
            lineHeight: 1.2,
          }}
        >
          {sub}
        </div>
        {isCandidate && (
          <div style={{ fontSize: 26, color: 'hsl(var(--muted-foreground))', marginTop: 16 }}>
            {data.candidateOffice} · {data.candidateParty}
          </div>
        )}
      </div>

      {/* Bottom */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 22,
          color: 'hsl(var(--muted-foreground))',
        }}
      >
        <span>
          {isCandidate
            ? `You ${formatScoreSafe(data.userScore)}  ·  Them ${formatScoreSafe(
                data.candidateScore,
              )}`
            : 'Find your political pulse'}
        </span>
        <span>{data.brandHost}</span>
      </div>
    </div>
  );
});
MinimalCard.displayName = 'MinimalCard';
