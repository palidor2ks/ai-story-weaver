import { forwardRef } from 'react';
import { CardData, CARD_SIZE, formatScoreSafe } from './types';
import { PulseMark } from './PulseMark';

type BaseballVariant = 'classic' | 'holo' | 'night';

interface Props {
  data: CardData;
  variant?: BaseballVariant;
}

const variantStyles: Record<BaseballVariant, { bg: string; border: string; stripe: string }> = {
  classic: {
    bg: 'linear-gradient(160deg, hsl(221 82% 20%) 0%, hsl(214 89% 28%) 45%, hsl(0 76% 42%) 100%)',
    border: 'hsl(0 0% 98%)',
    stripe: 'hsl(0 0% 100% / 0.2)',
  },
  holo: {
    bg: 'linear-gradient(135deg, hsl(215 95% 92%) 0%, hsl(0 100% 96%) 50%, hsl(220 90% 90%) 100%)',
    border: 'hsl(218 76% 34%)',
    stripe: 'hsl(0 71% 52% / 0.16)',
  },
  night: {
    bg: 'linear-gradient(160deg, hsl(228 61% 13%) 0%, hsl(215 75% 18%) 60%, hsl(0 62% 28%) 100%)',
    border: 'hsl(0 0% 96%)',
    stripe: 'hsl(0 0% 100% / 0.15)',
  },
};

export const BaseballCard = forwardRef<HTMLDivElement, Props>(({ data, variant = 'classic' }, ref) => {
  const isCandidate = data.kind === 'candidate-alignment';
  const isDonor = data.kind === 'donor-stats';
  const isInvite = data.kind === 'invite';
  const v = variantStyles[variant];

  const title = isCandidate
    ? data.candidateName ?? 'Candidate'
    : isDonor
    ? data.donorName ?? 'Donor'
    : isInvite
    ? 'Pulse Voter Card'
    : `${data.userName ?? 'Your'} Voter Card`;

  const subtitle = isCandidate
    ? `${data.candidateOffice ?? 'Public Official'} · ${data.candidateParty ?? 'Nonpartisan'}`
    : isDonor
    ? `${data.donorType ?? 'Donor'}${data.donorLocation ? ` · ${data.donorLocation}` : ''}`
    : 'Find your political pulse';

  const statA = isCandidate ? `${data.matchScore ?? 0}%` : isDonor ? data.totalGiven ?? '$0' : formatScoreSafe(data.userScore);
  const statALabel = isCandidate ? 'Match Score' : isDonor ? 'Total Given' : 'Ideology';

  const statB = isCandidate ? formatScoreSafe(data.candidateScore) : isDonor ? data.recipientCount ?? '0' : `${(data.topTopics ?? []).length}`;
  const statBLabel = isCandidate ? 'Candidate Score' : isDonor ? 'Recipients' : 'Top Issues';

  const statC = isCandidate
    ? `${(data.agreements ?? []).length + (data.disagreements ?? []).length}`
    : isDonor
    ? data.donationCount ?? '0'
    : data.brandHost;
  const statCLabel = isCandidate ? 'Compared Topics' : isDonor ? 'Donations' : 'Share';

  const patriotic = variant === 'classic' || variant === 'night';
  const textColor = patriotic ? 'hsl(0 0% 100%)' : 'hsl(var(--foreground))';
  const mutedColor = patriotic ? 'hsl(214 29% 85%)' : 'hsl(var(--muted-foreground))';

  return (
    <div ref={ref} style={{ width: CARD_SIZE, height: CARD_SIZE, background: v.bg, color: textColor, padding: 56, fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)' }}>
      <div style={{ height: '100%', border: `5px solid ${v.border}`, borderRadius: 36, overflow: 'hidden', position: 'relative', background: patriotic ? 'hsl(221 40% 14% / 0.58)' : 'hsl(var(--background) / 0.92)' }}>
        <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(-18deg, ${v.stripe} 0px, ${v.stripe} 36px, transparent 36px, transparent 72px)` }} />

        <div style={{ position: 'relative', height: '100%', padding: 42, display: 'grid', gridTemplateRows: 'auto auto 1fr auto auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><PulseMark size={46} /><span style={{ fontWeight: 800, fontSize: 30 }}>Pulse Share Card</span></div>
            <div style={{ fontSize: 20, letterSpacing: 2, textTransform: 'uppercase', color: mutedColor }}>{variant === 'classic' ? 'usa' : variant}</div>
          </div>
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 74, letterSpacing: -2, fontWeight: 900, lineHeight: 1.02 }}>{title}</div>
            <div style={{ fontSize: 30, marginTop: 10, color: mutedColor }}>{subtitle}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, alignSelf: 'center' }}>
            {[{ value: statA, label: statALabel }, { value: statB, label: statBLabel }, { value: statC, label: statCLabel }].map((s) => (
              <div key={s.label} style={{ border: `2px solid ${v.border}`, borderRadius: 18, padding: '24px 12px', textAlign: 'center', background: patriotic ? 'hsl(220 37% 18% / 0.82)' : 'hsl(var(--card) / 0.75)' }}>
                <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.1 }}>{s.value}</div>
                <div style={{ fontSize: 18, marginTop: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: mutedColor }}>{s.label}</div>
              </div>
            ))}
          </div>

          {isCandidate && data.fundingBreakdown && data.fundingBreakdown.length > 0 && (
            <div style={{ marginTop: 22, border: `2px solid ${v.border}`, borderRadius: 18, padding: '20px 22px', background: patriotic ? 'hsl(220 37% 18% / 0.82)' : 'hsl(var(--card) / 0.75)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 16, letterSpacing: 2, textTransform: 'uppercase', color: mutedColor }}>
                  Funding Sources{data.fundingCycle ? ` · ${data.fundingCycle} Cycle` : ''}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {data.fundingBreakdown.slice(0, 4).map((b) => (
                  <div key={b.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: 20, fontWeight: 600, color: textColor }}>{b.label}</span>
                      <span style={{ fontSize: 20, fontWeight: 700, color: b.color }}>{b.pct}%</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: patriotic ? 'hsl(0 0% 100% / 0.14)' : 'hsl(var(--muted) / 0.6)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(2, b.pct)}%`, height: '100%', background: b.color, borderRadius: 999 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, color: mutedColor, marginTop: 18 }}>
            <span>{isDonor ? 'Funding Snapshot' : 'Share your civic snapshot'}</span>
            <span style={{ fontWeight: 700, color: textColor }}>{data.brandHost}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

BaseballCard.displayName = 'BaseballCard';
