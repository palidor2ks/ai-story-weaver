import { forwardRef } from 'react';
import { CardData, CARD_SIZE } from './types';
import { PulseMark } from './PulseMark';

interface Props {
  data: CardData;
}

// Matches CandidateStatCard shell exactly
const FLAG_NAVY = 'hsl(220 70% 18%)';
const FLAG_NAVY_DEEP = 'hsl(220 78% 11%)';
const FLAG_RED = 'hsl(0 76% 46%)';
const FLAG_WHITE = 'hsl(0 0% 100%)';
const MUTED = 'hsl(214 35% 82%)';
const PANEL_BG = 'hsl(220 50% 14% / 0.78)';
const INNER_BG = 'linear-gradient(180deg, hsl(220 60% 13%) 0%, hsl(220 55% 16%) 100%)';

// Amber is reserved only for the CTA button accent
const AMBER = '#F59E0B';

const fmtMoney = (n?: number | null) => {
  if (!n || !Number.isFinite(n) || n <= 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};

const truncate = (s: string, max = 28) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

const causeBadgeStyle = (stance?: string | null) => {
  const normalized = (stance ?? '').toLowerCase();
  if (normalized === 'pro') return {
    border: '1px solid hsl(142 72% 56% / 0.6)',
    color: 'hsl(142 76% 82%)',
    background: 'hsl(142 72% 35% / 0.18)',
  };
  if (normalized === 'anti') return {
    border: '1px solid hsl(348 84% 60% / 0.6)',
    color: 'hsl(348 90% 84%)',
    background: 'hsl(348 84% 45% / 0.18)',
  };
  return {
    border: '1px solid hsl(38 92% 58% / 0.65)',
    color: 'hsl(45 96% 82%)',
    background: 'hsl(38 92% 45% / 0.18)',
  };
};

const fitNameFontSize = (name: string, baseSize: number, minSize: number) => {
  const length = name.trim().length;
  if (length >= 58) return minSize;
  if (length >= 46) return minSize + 1;
  if (length >= 34) return minSize + 2;
  return baseSize;
};

const fittedNameStyle = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
} as const;

const LockedRow = ({ label = 'Sign up to reveal', opacity = 1 }: { label?: string; opacity?: number }) => (
  <div style={{ opacity }}>
    <div style={{
      height: 58,
      borderRadius: 12,
      background: `${FLAG_NAVY_DEEP}CC`,
      border: `1.5px solid ${FLAG_WHITE}18`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 10,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span style={{ fontSize: 14, fontWeight: 700, color: MUTED, letterSpacing: 0.3 }}>{label}</span>
    </div>
  </div>
);

export const SignupTeaserCard = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const donors = (data.topDonors ?? []).slice(0, 3);
  const name = data.candidateName ?? 'This Candidate';
  const lastName = name.split(' ').slice(-1)[0] ?? name;
  const officeLine = [data.candidateOffice, data.candidateState].filter(Boolean).join(' · ');
  const cycleLabel = data.fundingCycle ? ` · ${data.fundingCycle}` : '';
  const hasData = donors.length > 0;

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
      {/* Inner panel — mirrors CandidateStatCard */}
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
          padding: 28, paddingBottom: 28,
          display: 'flex', flexDirection: 'column', gap: 0,
        }}>
          {/* ── Header ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 22,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <PulseMark size={42} />
              <span style={{ fontWeight: 800, fontSize: 25, letterSpacing: -0.3 }}>PoliPulse</span>
            </div>
            <div style={{
              background: `${FLAG_WHITE}18`,
              border: `2px solid ${FLAG_WHITE}35`,
              color: FLAG_WHITE,
              borderRadius: 999,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 2.5,
              textTransform: 'uppercase' as const,
            }}>
              Follow The Money
            </div>
          </div>

          {/* ── Hero question ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 15, color: MUTED, letterSpacing: 2.5,
              textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 8,
            }}>
              Public FEC records show
            </div>
            <div style={{ fontSize: 58, fontWeight: 900, letterSpacing: -2, lineHeight: 1.02 }}>
              Who's bankrolling
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 64, fontWeight: 900, letterSpacing: -2.5, lineHeight: 1.02, color: FLAG_WHITE }}>
                {truncate(lastName, 16)}'s
              </span>
              <span style={{ fontSize: 52, fontWeight: 900, letterSpacing: -2, lineHeight: 1.02 }}>
                campaign?
              </span>
            </div>
          </div>

          {/* ── Office + prominent raised amount ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 17, color: MUTED, fontWeight: 500, marginBottom: 6 }}>{officeLine}</div>
            {data.totalRaised && data.totalRaised > 0 && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 44, fontWeight: 900, color: FLAG_WHITE, letterSpacing: -1.5, lineHeight: 1 }}>
                  {fmtMoney(data.totalRaised)}
                </span>
                <span style={{ fontSize: 16, fontWeight: 600, color: MUTED }}>raised this cycle</span>
              </div>
            )}
          </div>

          {/* ── Section label ── */}
          <div style={{
            fontSize: 11, color: MUTED, letterSpacing: 3,
            textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 12,
          }}>
            Top donors{cycleLabel}
          </div>

          {/* ── Donor grid (CandidateStatCard style) or skeleton ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hasData ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {donors.map((d, i) => (
                    <div key={`donor-${i}`} style={{
                      border: `2px solid ${FLAG_WHITE}`,
                      borderRadius: 12,
                      padding: '10px 12px',
                      background: PANEL_BG,
                    }}>
                      <div style={{
                        ...fittedNameStyle,
                        fontSize: fitNameFontSize(d.name, 14, 10),
                        fontWeight: 700,
                        color: FLAG_WHITE,
                        lineHeight: 1.15,
                        marginBottom: 4,
                        minHeight: 34,
                      }}>
                        {d.name}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: FLAG_WHITE }}>
                        {fmtMoney(d.amount)}
                      </div>
                      {d.viaEarmarks && (
                        <div style={{
                          fontSize: 11, color: MUTED, fontWeight: 800,
                          letterSpacing: 0.6, textTransform: 'uppercase' as const, marginTop: 2,
                        }}>
                          by or through
                        </div>
                      )}
                      {d.primaryCause && (
                        <div style={{
                          marginTop: 8,
                          display: 'inline-flex', alignItems: 'center',
                          maxWidth: '100%',
                          ...causeBadgeStyle(d.primaryCauseStance),
                          borderRadius: 999,
                          padding: '4px 8px',
                          fontSize: 11, fontWeight: 800,
                          letterSpacing: 0.5,
                          textTransform: 'uppercase' as const,
                        }}>
                          {truncate(d.primaryCause, 18)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <LockedRow />
                <LockedRow label="Sign up to reveal" opacity={0.7} />
              </>
            ) : (
              // No donor data — show locked skeleton grid
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{
                      border: `2px solid ${FLAG_WHITE}12`,
                      borderRadius: 12,
                      padding: '12px 14px',
                      background: PANEL_BG,
                      opacity: 1 - i * 0.08,
                    }}>
                      <div style={{ height: 14, borderRadius: 6, background: `${FLAG_WHITE}14`, marginBottom: 8 }} />
                      <div style={{ height: 10, borderRadius: 6, background: `${FLAG_WHITE}10`, width: '70%', marginBottom: 8 }} />
                      <div style={{ height: 20, borderRadius: 6, background: `${FLAG_WHITE}12`, width: '55%' }} />
                    </div>
                  ))}
                </div>
                <LockedRow label="Donor data loading" />
                <LockedRow label="Sign up to reveal" opacity={0.7} />
              </>
            )}
          </div>

          {/* ── CTA banner ── */}
          <div style={{
            background: `linear-gradient(90deg, hsl(220 78% 11%) 0%, hsl(220 60% 16%) 100%)`,
            border: `1.5px solid ${FLAG_WHITE}22`,
            borderRadius: 16,
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 16,
            gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: FLAG_WHITE, letterSpacing: -0.3, lineHeight: 1.1 }}>
                See every donor — free
              </div>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 3, fontWeight: 600 }}>
                Track money across every race · polipulseapp.com
              </div>
            </div>
            <div style={{
              background: AMBER, color: FLAG_NAVY_DEEP,
              borderRadius: 10, padding: '10px 20px',
              fontSize: 16, fontWeight: 900, letterSpacing: 0.3,
              whiteSpace: 'nowrap' as const, flexShrink: 0,
            }}>
              Sign Up Free →
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 12, fontSize: 13, color: MUTED,
          }}>
            <span>Data from FEC public records</span>
            <span style={{ fontWeight: 700, color: FLAG_WHITE }}>{data.brandHost}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

SignupTeaserCard.displayName = 'SignupTeaserCard';
