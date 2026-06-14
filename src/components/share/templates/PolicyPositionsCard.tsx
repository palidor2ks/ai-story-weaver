import { forwardRef } from 'react';
import { CardData, CARD_SIZE } from './types';
import { PulseMark } from './PulseMark';
import { formatScore, getScoreLabelProgCon } from '@/lib/scoreFormat';

interface Props {
  data: CardData;
}

const FLAG_NAVY = 'hsl(220 70% 18%)';
const FLAG_NAVY_DEEP = 'hsl(220 78% 11%)';
const FLAG_RED = 'hsl(0 76% 46%)';
const FLAG_WHITE = 'hsl(0 0% 100%)';
const MUTED = 'hsl(214 35% 82%)';
const PANEL_BG = 'hsl(220 50% 14% / 0.78)';
const INNER_BG = 'linear-gradient(180deg, hsl(220 60% 13%) 0%, hsl(220 55% 16%) 100%)';

const VIOLET = '#7C3AED';
const VIOLET_LIT = '#A78BFA';
const VIOLET_GLOW = '#C4B5FD';

const partyColor = (party?: string) => {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('dem')) return 'hsl(214 89% 52%)';
  if (p.startsWith('rep')) return FLAG_RED;
  if (p.startsWith('ind')) return '#A855F7';
  return MUTED;
};

const partyInitial = (party?: string) => {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('dem')) return 'D';
  if (p.startsWith('rep')) return 'R';
  if (p.startsWith('ind')) return 'I';
  return '?';
};

const scoreToPercent = (score?: number | null) => {
  if (score == null || !Number.isFinite(score)) return 50;
  return ((Math.max(-10, Math.min(10, score)) + 10) / 20) * 100;
};

const truncate = (s: string, max = 22) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

const SkeletonRow = () => (
  <div style={{ marginBottom: 4 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
      <div style={{ height: 14, borderRadius: 999, background: `${FLAG_WHITE}15`, width: '38%' }} />
    </div>
    <div style={{ height: 12, borderRadius: 999, background: `${FLAG_WHITE}10`, marginBottom: 5 }} />
  </div>
);

const LockedRow = ({ topicName, score, opacity = 1 }: { topicName?: string; score?: number; opacity?: number }) => {
  const hasScore = score != null && Number.isFinite(score);
  const topicPct = hasScore ? scoreToPercent(score) : 62;
  return (
    <div style={{ opacity }}>
      <div style={{ marginBottom: 5 }}>
        {topicName ? (
          <div style={{ fontSize: 15, fontWeight: 800, color: FLAG_WHITE, opacity: 0.4, lineHeight: 1.1 }}>
            {topicName}
          </div>
        ) : (
          <div style={{ height: 14, width: '42%', borderRadius: 999, background: `${FLAG_WHITE}14` }} />
        )}
      </div>
      <div style={{ position: 'relative', height: 24 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 12, borderRadius: 999, background: 'linear-gradient(90deg, hsl(214 89% 56%) 0%, hsl(270 72% 66%) 50%, hsl(0 76% 52%) 100%)', opacity: 0.3 }} />
        <div style={{ position: 'absolute', left: '50%', top: 1, width: 1.5, height: 22, background: `${FLAG_WHITE}18`, transform: 'translateX(-50%)' }} />
        <div style={{ position: 'absolute', left: `${topicPct}%`, top: 0, transform: 'translateX(-50%)', width: 24, height: 24, borderRadius: '50%', border: `2px solid ${FLAG_WHITE}22`, background: `${FLAG_WHITE}10` }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.3 }}>Sign up to unlock</span>
      </div>
    </div>
  );
};

export const PolicyPositionsCard = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const name = data.candidateName ?? 'This Candidate';
  const lastName = name.split(' ').slice(-1)[0] ?? name;
  const displayName = truncate(name, 28);
  const heroFontSize = name.length > 20 ? 38 : name.length > 14 ? 44 : 52;
  const party = data.candidateParty ?? '';
  const officeLine = [data.candidateOffice, data.candidateState].filter(Boolean).join(' · ');
  const ideologyPct = scoreToPercent(data.candidateScore);
  const hasScore = data.candidateScore != null && Number.isFinite(data.candidateScore);
  const pulseScore = hasScore ? formatScore(data.candidateScore) : null;
  const pulseLabel = hasScore ? getScoreLabelProgCon(data.candidateScore) : 'Not yet scored';
  const positions = data.aiPositions; // undefined = loading, [] = none found

  // Topics 5 & 6 by |score| — shown in locked rows
  const lockedTopics = (data.allTopicScores ?? []).slice(4, 6);

  const cardBg = `linear-gradient(160deg, ${FLAG_NAVY_DEEP} 0%, ${FLAG_NAVY} 50%, ${FLAG_RED} 100%)`;

  return (
    <div
      ref={ref}
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: cardBg,
        color: FLAG_WHITE,
        padding: 32,
        fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
      }}
    >
      <div style={{
        height: '100%',
        border: `5px solid ${FLAG_WHITE}`,
        borderRadius: 36,
        overflow: 'hidden',
        position: 'relative',
        background: INNER_BG,
      }}>
        {/* Red bottom stripe */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: 10,
          background: FLAG_RED,
        }} />

        <div style={{
          position: 'relative', height: '100%',
          padding: 22,
          display: 'flex', flexDirection: 'column', gap: 0,
        }}>

          {/* ── Header ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <PulseMark size={42} />
              <span style={{ fontWeight: 800, fontSize: 25, letterSpacing: -0.3 }}>PoliPulse</span>
            </div>

            {data.candidateImage ? (
              <div style={{
                width: 90, height: 90, borderRadius: '50%',
                border: `3px solid ${FLAG_WHITE}`,
                overflow: 'hidden',
                flexShrink: 0,
                boxShadow: `0 0 0 2px ${VIOLET}88`,
              }}>
                <img
                  src={data.candidateImage}
                  alt={name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            ) : (
              <div style={{
                width: 90, height: 90, borderRadius: '50%',
                border: `3px solid ${FLAG_WHITE}`,
                background: `${VIOLET}40`,
                boxShadow: `0 0 0 2px ${VIOLET}88`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, fontWeight: 900, color: VIOLET_GLOW, flexShrink: 0,
              }}>
                {lastName[0]?.toUpperCase() ?? '?'}
              </div>
            )}

            <div style={{
              background: `${VIOLET}28`,
              border: `2px solid ${VIOLET_LIT}55`,
              color: VIOLET_GLOW,
              borderRadius: 999,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 2.5,
              textTransform: 'uppercase' as const,
            }}>
              Where Do They Stand?
            </div>
          </div>

          {/* ── Candidate identity ── */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const, marginBottom: 6 }}>
              <span style={{ fontSize: heroFontSize, fontWeight: 900, letterSpacing: -2, lineHeight: 1.02 }}>
                {displayName}'s
              </span>
              <span style={{ fontSize: Math.round(heroFontSize * 0.62), fontWeight: 900, color: VIOLET_LIT, letterSpacing: -0.5 }}>
                record
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 17, color: MUTED, fontWeight: 500 }}>{officeLine}</span>
              {party && (
                <span style={{
                  background: `${partyColor(party)}22`,
                  border: `1.5px solid ${partyColor(party)}66`,
                  color: partyColor(party),
                  borderRadius: 999, padding: '3px 12px',
                  fontSize: 14, fontWeight: 800,
                }}>
                  {partyInitial(party)} · {party.split(' ')[0]}
                </span>
              )}
            </div>
          </div>

          {/* ── Pulse Score + Ideology spectrum ── */}
          <div style={{
            background: PANEL_BG,
            border: `2px solid ${FLAG_WHITE}22`,
            borderRadius: 18,
            padding: '12px 18px',
            marginBottom: 12,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 12,
            }}>
              <div>
                <div style={{
                  fontSize: 11, color: MUTED, letterSpacing: 2.5,
                  textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 3,
                }}>
                  Voting record ideology
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 800,
                  color: hasScore ? FLAG_WHITE : MUTED,
                }}>
                  {pulseLabel}
                </div>
              </div>
              <div style={{
                background: `${VIOLET}30`,
                border: `2px solid ${VIOLET_LIT}50`,
                borderRadius: 12,
                padding: '8px 16px',
                textAlign: 'center' as const,
                minWidth: 90,
              }}>
                <div style={{ fontSize: 10, color: MUTED, letterSpacing: 2, textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 2 }}>
                  Pulse Score
                </div>
                <div style={{ fontSize: pulseScore ? 34 : 18, fontWeight: 900, color: pulseScore ? VIOLET_GLOW : MUTED, letterSpacing: -0.5 }}>
                  {pulseScore ?? '—'}
                </div>
              </div>
            </div>

            <div style={{ position: 'relative', height: 42, margin: '0 2px' }}>
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 12,
                height: 16, borderRadius: 999,
                background: 'linear-gradient(90deg, hsl(214 89% 56%) 0%, hsl(270 72% 66%) 50%, hsl(0 76% 52%) 100%)',
                boxShadow: 'inset 0 0 0 2px hsl(0 0% 100% / 0.2)',
                opacity: hasScore ? 1 : 0.4,
              }} />
              <div style={{
                position: 'absolute', left: '50%', top: 6, width: 2, height: 28,
                background: `${FLAG_WHITE}50`, transform: 'translateX(-50%)', borderRadius: 999,
              }} />
              <div style={{
                position: 'absolute',
                left: `${ideologyPct}%`, top: 0,
                transform: 'translateX(-50%)',
                width: 42, height: 42, borderRadius: '50%',
                border: `4px solid ${FLAG_WHITE}`,
                background: hasScore ? FLAG_NAVY_DEEP : MUTED,
                boxShadow: `0 0 0 3px ${VIOLET}88, 0 6px 16px rgba(0,0,0,0.5)`,
              }} />
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              fontSize: 11, color: MUTED, fontWeight: 700,
              letterSpacing: 1.2, textTransform: 'uppercase' as const, marginTop: 4,
            }}>
              <span>← Progressive</span>
              <span style={{ textAlign: 'center' }}>Moderate</span>
              <span style={{ textAlign: 'right' }}>Conservative →</span>
            </div>
          </div>

          {/* ── Positions section ── */}
          <div style={{ flex: 1, marginBottom: 10 }}>
            <div style={{
              fontSize: 11, color: MUTED, letterSpacing: 2.5,
              textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 8,
            }}>
              On the issues
            </div>

            {positions === undefined ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : positions.length === 0 ? (
              <div style={{
                flex: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 16, opacity: 0.5, padding: '20px 0',
              }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
                  stroke={MUTED} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div style={{ fontSize: 17, color: MUTED, fontWeight: 700, textAlign: 'center' as const }}>
                  Topic-level analysis not yet available
                </div>
                <div style={{ fontSize: 13, color: MUTED, fontWeight: 400, textAlign: 'center' as const, maxWidth: 360, lineHeight: 1.5 }}>
                  Voting record ideology is shown above — issue-by-issue breakdown is pending
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {positions.map((pos, i) => {
                  const hasTopicScore = pos.score != null && Number.isFinite(pos.score);
                  const topicPct = hasTopicScore ? scoreToPercent(pos.score) : 50;
                  const scoreCode = hasTopicScore ? formatScore(pos.score) : null;
                  const labelLeft = Math.max(8, Math.min(88, topicPct));
                  const dotColor = hasTopicScore
                    ? (pos.score! < -0.5 ? 'hsl(214 89% 52%)' : pos.score! > 0.5 ? 'hsl(0 76% 52%)' : 'hsl(270 72% 60%)')
                    : MUTED;
                  return (
                    <div key={i}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: FLAG_WHITE, lineHeight: 1.1, marginBottom: 5 }}>
                        {pos.topic}
                      </div>
                      {pos.detail && (
                        <div style={{ fontSize: 11, color: MUTED, fontWeight: 500, lineHeight: 1.3, marginBottom: 4 }}>
                          {pos.detail}
                        </div>
                      )}
                      <div style={{ position: 'relative', height: 24 }}>
                        <div style={{
                          position: 'absolute', left: 0, right: 0, top: 6, height: 12, borderRadius: 999,
                          background: 'linear-gradient(90deg, hsl(214 89% 56%) 0%, hsl(270 72% 66%) 50%, hsl(0 76% 52%) 100%)',
                          opacity: 0.85,
                        }} />
                        <div style={{
                          position: 'absolute', left: '50%', top: 1, width: 1.5, height: 22,
                          background: `${FLAG_WHITE}35`, transform: 'translateX(-50%)',
                        }} />
                        <div style={{
                          position: 'absolute',
                          left: `${topicPct}%`, top: 0,
                          transform: 'translateX(-50%)',
                          width: 24, height: 24, borderRadius: '50%',
                          border: `3px solid ${FLAG_WHITE}`,
                          background: dotColor,
                          boxShadow: `0 0 0 2px ${dotColor}55, 0 3px 8px rgba(0,0,0,0.4)`,
                        }} />
                        {scoreCode && (
                          <div style={{
                            position: 'absolute', top: -14,
                            left: `${labelLeft}%`,
                            transform: 'translateX(-50%)',
                            fontSize: 11, fontWeight: 900,
                            color: pos.score! < 0 ? 'hsl(214 89% 75%)' : 'hsl(0 76% 75%)',
                            letterSpacing: 0.3, whiteSpace: 'nowrap' as const,
                          }}>
                            {scoreCode}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {positions.length >= 4 && (
                  <>
                    <LockedRow topicName={lockedTopics[0]?.topicName} score={lockedTopics[0]?.score} />
                    <LockedRow topicName={lockedTopics[1]?.topicName} score={lockedTopics[1]?.score} opacity={0.65} />
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── CTA banner ── */}
          <div style={{
            background: `linear-gradient(90deg, ${VIOLET}D8, #5B21B6D8)`,
            borderRadius: 16,
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: FLAG_WHITE, letterSpacing: -0.3, lineHeight: 1.1 }}>
                Do you agree with their record?
              </div>
              <div style={{ fontSize: 12, color: VIOLET_GLOW, marginTop: 3, fontWeight: 600 }}>
                2-min quiz · free · polipulseapp.com
              </div>
            </div>
            <div style={{
              background: FLAG_WHITE, color: VIOLET,
              borderRadius: 10, padding: '10px 20px',
              fontSize: 15, fontWeight: 900, letterSpacing: 0.3,
              whiteSpace: 'nowrap' as const, flexShrink: 0,
            }}>
              Find My Match →
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 8, fontSize: 13, color: MUTED,
          }}>
            <span>Based on voting record &amp; FEC data</span>
            <span style={{ fontWeight: 700, color: FLAG_WHITE }}>{data.brandHost}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

PolicyPositionsCard.displayName = 'PolicyPositionsCard';
