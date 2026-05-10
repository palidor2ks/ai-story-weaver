import { forwardRef } from 'react';
import { CardData, CARD_SIZE, formatScoreSafe, labelSafe } from './types';
import { PulseMark } from './PulseMark';

interface Props {
  data: CardData;
}

/**
 * EDITORIAL — Magazine pull-quote style.
 * Left portrait/avatar, large pull-quote, footer.
 */
export const EditorialCard = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const isCandidate = data.kind === 'candidate-alignment';
  const isInvite = data.kind === 'invite';
  const initials = (isCandidate ? data.candidateName : data.userName) || 'P';
  const initial = initials.trim().charAt(0).toUpperCase();
  const portrait = isCandidate ? data.candidateImage : null;

  const quote = isCandidate
    ? `${data.matchScore}% aligned with ${data.candidateName}.`
    : isInvite
    ? `Discover where you really stand.`
    : `My pulse: ${formatScoreSafe(data.userScore)} — ${labelSafe(data.userScore)}.`;

  return (
    <div
      ref={ref}
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        display: 'flex',
        fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
        position: 'relative',
      }}
    >
      {/* Left band with portrait/avatar */}
      <div
        style={{
          width: 420,
          background:
            'linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'hsl(var(--primary-foreground))',
          position: 'relative',
        }}
      >
        {portrait ? (
          <img
            src={portrait}
            alt=""
            crossOrigin="anonymous"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : data.kind === 'user-profile' ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 18,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 22,
                letterSpacing: 6,
                textTransform: 'uppercase',
                opacity: 0.85,
              }}
            >
              My Pulse
            </div>
            <div
              style={{
                fontSize: 140,
                fontWeight: 800,
                letterSpacing: -4,
                lineHeight: 1,
              }}
            >
              {formatScoreSafe(data.userScore)}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 600,
                opacity: 0.95,
              }}
            >
              {labelSafe(data.userScore)}
            </div>
          </div>
        ) : data.kind === 'invite' ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 24,
            }}
          >
            <PulseMark size={200} framed frameColor="rgba(255,255,255,0.18)" />
            <div
              style={{
                fontSize: 56,
                fontWeight: 800,
                letterSpacing: -2,
              }}
            >
              Pulse
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: 280,
              fontWeight: 800,
              letterSpacing: -8,
              lineHeight: 1,
            }}
          >
            {initial}
          </div>
        )}
        {/* Gradient overlay if image */}
        {portrait && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.45) 100%)',
            }}
          />
        )}
        {/* Brand badge over portrait */}
        <div
          style={{
            position: 'absolute',
            top: 32,
            left: 32,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: 'hsl(var(--primary-foreground))',
            zIndex: 1,
          }}
        >
          <PulseMark size={48} framed frameColor="rgba(255,255,255,0.22)" />
          <span style={{ fontWeight: 700, fontSize: 24, letterSpacing: -0.3 }}>Pulse</span>
        </div>
      </div>

      {/* Right column */}
      <div
        style={{
          flex: 1,
          padding: 80,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontSize: 22,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: 'hsl(var(--muted-foreground))',
              marginBottom: 30,
            }}
          >
            <PulseMark size={48} />
            <span>Pulse · {isCandidate ? 'Voter Match' : isInvite ? 'Invitation' : 'My Profile'}</span>
          </div>
          <div
            style={{
              fontSize: 32,
              color: 'hsl(var(--primary))',
              fontWeight: 700,
              marginBottom: 28,
              lineHeight: 1,
            }}
          >
            “
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              fontFamily: 'Georgia, "Times New Roman", serif',
            }}
          >
            {quote}
          </div>
          {isCandidate && (
            <div
              style={{
                marginTop: 36,
                fontSize: 26,
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              {data.candidateOffice} · {data.candidateParty}
            </div>
          )}
        </div>

        <div>
          <div
            style={{
              height: 1,
              background: 'hsl(var(--border))',
              marginBottom: 24,
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 24,
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            <span>
              {isCandidate
                ? `You ${formatScoreSafe(data.userScore)} · Them ${formatScoreSafe(
                    data.candidateScore,
                  )}`
                : 'Take the quiz'}
            </span>
            <span style={{ fontWeight: 700, color: 'hsl(var(--foreground))' }}>
              {data.brandHost}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
EditorialCard.displayName = 'EditorialCard';
