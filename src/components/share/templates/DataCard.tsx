import { forwardRef } from 'react';
import { CardData, CARD_SIZE, formatScoreSafe } from './types';

interface Props {
  data: CardData;
}

const TopicBar = ({
  topic,
  score,
  compareScore,
}: {
  topic: string;
  score: number;
  compareScore?: number | null;
}) => {
  // -10..10 mapped to 0..100%
  const pos = ((score + 10) / 20) * 100;
  const cmp = compareScore != null ? ((compareScore + 10) / 20) * 100 : null;
  return (
    <div style={{ marginBottom: 32 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 26,
          fontWeight: 600,
          marginBottom: 14,
          color: 'hsl(var(--foreground))',
        }}
      >
        <span>{topic}</span>
        <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>
          {formatScoreSafe(score)}
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          height: 18,
          background:
            'linear-gradient(90deg, hsl(220 80% 60% / 0.25), hsl(0 0% 80% / 0.25), hsl(0 80% 60% / 0.25))',
          borderRadius: 999,
        }}
      >
        {/* center tick */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: -4,
            width: 2,
            height: 26,
            background: 'hsl(var(--border))',
            transform: 'translateX(-50%)',
          }}
        />
        {/* user marker */}
        <div
          style={{
            position: 'absolute',
            left: `${pos}%`,
            top: -10,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'hsl(var(--primary))',
            border: '4px solid hsl(var(--background))',
            transform: 'translateX(-50%)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
          }}
        />
        {cmp != null && (
          <div
            style={{
              position: 'absolute',
              left: `${cmp}%`,
              top: -10,
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'hsl(var(--foreground))',
              border: '4px solid hsl(var(--background))',
              transform: 'translateX(-50%)',
              boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
            }}
          />
        )}
      </div>
    </div>
  );
};

/**
 * DATA CARD — Most informative.
 * Top topic bars with left/right scale, dots for user vs candidate.
 */
export const DataCard = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const isCandidate = data.kind === 'candidate-alignment';
  const topics = isCandidate
    ? [...(data.agreements ?? []), ...(data.disagreements ?? [])].slice(0, 4)
    : (data.topTopics ?? []).slice(0, 4);

  return (
    <div
      ref={ref}
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: 'hsl(var(--card))',
        color: 'hsl(var(--card-foreground))',
        padding: 80,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 40,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 24,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: 'hsl(var(--muted-foreground))',
              marginBottom: 8,
            }}
          >
            Pulse · {isCandidate ? 'Voter Alignment' : 'My Profile'}
          </div>
          <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1.5 }}>
            {isCandidate ? data.candidateName : 'Top Issues'}
          </div>
          {isCandidate && (
            <div style={{ fontSize: 26, color: 'hsl(var(--muted-foreground))', marginTop: 6 }}>
              {data.candidateOffice} · {data.candidateParty}
            </div>
          )}
        </div>
        <div
          style={{
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            borderRadius: 24,
            padding: '20px 32px',
            fontSize: 56,
            fontWeight: 800,
            letterSpacing: -1,
          }}
        >
          {isCandidate ? `${data.matchScore}%` : formatScoreSafe(data.userScore)}
        </div>
      </div>

      {/* Scale legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 20,
          color: 'hsl(var(--muted-foreground))',
          marginBottom: 28,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        <span>Left</span>
        <span>Center</span>
        <span>Right</span>
      </div>

      {/* Topic bars */}
      <div style={{ flex: 1 }}>
        {topics.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontSize: 32,
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            Take the quiz to see your topic breakdown
          </div>
        ) : (
          topics.map(t => (
            <TopicBar
              key={t.topicName}
              topic={t.topicName}
              score={isCandidate ? data.userScore ?? 0 : t.score}
              compareScore={isCandidate ? t.score : null}
            />
          ))
        )}
      </div>

      {/* Footer legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 16,
          fontSize: 22,
          color: 'hsl(var(--muted-foreground))',
        }}
      >
        <div style={{ display: 'flex', gap: 28 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'hsl(var(--primary))',
                display: 'inline-block',
              }}
            />
            You
          </span>
          {isCandidate && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'hsl(var(--foreground))',
                  display: 'inline-block',
                }}
              />
              Them
            </span>
          )}
        </div>
        <span style={{ fontWeight: 600 }}>{data.brandHost}</span>
      </div>
    </div>
  );
});
DataCard.displayName = 'DataCard';
