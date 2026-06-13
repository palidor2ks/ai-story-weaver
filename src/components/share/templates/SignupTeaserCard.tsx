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

// Amber accent — "money / follow the money" theme
const AMBER = '#F59E0B';
const AMBER_LIT = '#FCD34D';
const AMBER_DARK = '#92400E';

const fmtMoney = (n?: number | null) => {
  if (!n || !Number.isFinite(n) || n <= 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};

const truncate = (s: string, max = 28) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

const LockedRow = ({ label = 'Sign up to reveal', opacity = 1 }: { label?: string; opacity?: number }) => (
  <div style={{ position: 'relative', opacity }}>
    <div style={{
      height: 62,
      borderRadius: 12,
      background: PANEL_BG,
      border: `1.5px solid ${FLAG_WHITE}22`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      gap: 14,
      overflow: 'hidden',
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: `${FLAG_WHITE}18`, flexShrink: 0 }} />
      <div style={{ flex: 1, height: 13, borderRadius: 999, background: `${FLAG_WHITE}18` }} />
      <div style={{ width: 68, height: 22, borderRadius: 8, background: `${FLAG_WHITE}18`, flexShrink: 0 }} />
    </div>
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 10, borderRadius: 12,
      background: 'rgba(8, 15, 30, 0.45)',
    }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={AMBER_LIT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span style={{ fontSize: 15, fontWeight: 700, color: AMBER_LIT, letterSpacing: 0.3 }}>
        {label}
      </span>
    </div>
  </div>
);

export const SignupTeaserCard = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const donors = (data.topDonors ?? []).slice(0, 3);
  const maxAmount = Math.max(...donors.map((d) => d.amount), 1);
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
            marginBottom: 26,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <PulseMark size={42} />
              <span style={{ fontWeight: 800, fontSize: 25, letterSpacing: -0.3 }}>PoliPulse</span>
            </div>
            <div style={{
              background: `${AMBER}28`,
              border: `2px solid ${AMBER}70`,
              color: AMBER_LIT,
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
          <div style={{ marginBottom: 10 }}>
            <div style={{
              fontSize: 16, color: MUTED, letterSpacing: 2.5,
              textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 10,
            }}>
              Public FEC records show
            </div>
            <div style={{ fontSize: 62, fontWeight: 900, letterSpacing: -2, lineHeight: 1.02 }}>
              Who's bankrolling
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 68, fontWeight: 900, letterSpacing: -2.5, lineHeight: 1.02, color: AMBER_LIT }}>
                {truncate(lastName, 16)}'s
              </span>
              <span style={{ fontSize: 56, fontWeight: 900, letterSpacing: -2, lineHeight: 1.02 }}>
                campaign?
              </span>
            </div>
          </div>

          {/* Office + raised pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: 20, color: MUTED, fontWeight: 500 }}>{officeLine}</span>
            {data.totalRaised && data.totalRaised > 0 && (
              <>
                <span style={{ color: `${FLAG_WHITE}30`, fontSize: 18 }}>·</span>
                <span style={{
                  background: `${AMBER}18`,
                  border: `1.5px solid ${AMBER}55`,
                  color: AMBER_LIT,
                  borderRadius: 8,
                  padding: '4px 14px',
                  fontSize: 18,
                  fontWeight: 800,
                }}>
                  {fmtMoney(data.totalRaised)} raised
                </span>
              </>
            )}
          </div>

          {/* ── Section label ── */}
          <div style={{
            fontSize: 12, color: MUTED, letterSpacing: 3,
            textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 14,
          }}>
            Top donors{cycleLabel}
          </div>

          {/* ── Donor rows or skeleton ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
            {hasData ? donors.map((d, i) => {
              const pct = Math.round((d.amount / maxAmount) * 100);
              const rankAlpha = ['FF', 'CC', 'AA'][i] ?? 'AA';
              return (
                <div key={`donor-${i}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 7 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: 7,
                      background: `${AMBER}${['20', '18', '12'][i]}`,
                      border: `1.5px solid ${AMBER}${rankAlpha}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 900, color: AMBER_LIT, flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 20, fontWeight: 700, flex: 1, minWidth: 0 }}>
                      {truncate(d.name, 32)}
                    </span>
                    {d.primaryCause && (
                      <span style={{
                        fontSize: 12, color: MUTED,
                        background: PANEL_BG,
                        border: `1px solid ${FLAG_WHITE}22`,
                        borderRadius: 6, padding: '3px 10px', fontWeight: 600,
                        whiteSpace: 'nowrap' as const,
                      }}>
                        {truncate(d.primaryCause, 18)}
                      </span>
                    )}
                    <span style={{
                      fontSize: 22, fontWeight: 900, color: FLAG_WHITE,
                      flexShrink: 0, minWidth: 76, textAlign: 'right' as const,
                    }}>
                      {fmtMoney(d.amount)}
                    </span>
                  </div>
                  <div style={{ height: 8, background: `${FLAG_WHITE}15`, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      width: `${pct}%`, height: '100%', borderRadius: 999,
                      background: `linear-gradient(90deg, ${AMBER_DARK}, ${AMBER_LIT})`,
                    }} />
                  </div>
                </div>
              );
            }) : (
              // No donor data yet — show 3 locked skeleton rows
              [0, 1, 2].map((i) => <LockedRow key={i} label="Donor data unavailable" opacity={1 - i * 0.1} />)
            )}

            {/* Always-locked rows */}
            <LockedRow />
            <LockedRow label="Sign up to reveal" opacity={0.75} />
          </div>

          {/* ── CTA banner ── */}
          <div style={{
            background: `linear-gradient(90deg, ${AMBER_DARK}E8, ${AMBER}E8)`,
            borderRadius: 16,
            padding: '18px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 18,
            gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0A0A0A', letterSpacing: -0.3, lineHeight: 1.1 }}>
                See every donor — free
              </div>
              <div style={{ fontSize: 14, color: '#2A1500', marginTop: 3, fontWeight: 600 }}>
                Track money across every race · polipulseapp.com
              </div>
            </div>
            <div style={{
              background: '#0A0A0A', color: AMBER_LIT,
              borderRadius: 10, padding: '10px 22px',
              fontSize: 17, fontWeight: 900, letterSpacing: 0.3,
              whiteSpace: 'nowrap' as const, flexShrink: 0,
            }}>
              Sign Up Free →
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 14, fontSize: 15, color: MUTED,
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
