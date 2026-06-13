import { forwardRef } from 'react';
import { CardData, CARD_SIZE } from './types';
import { PulseMark } from './PulseMark';

interface Props {
  data: CardData;
}

const AMBER = '#F59E0B';
const AMBER_LIT = '#FCD34D';
const AMBER_DARK = '#92400E';
const BG = '#08101E';
const BG2 = '#0D1A2E';
const PANEL = '#111E33';
const INK = '#F1F5F9';
const MUTED = '#64748B';
const MUTED_LIGHT = '#94A3B8';
const BORDER = '#1E2D45';

const fmtMoney = (n?: number | null) => {
  if (!n || !Number.isFinite(n) || n <= 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};

const truncate = (s: string, max = 28) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

// Visually implies "hidden text" without CSS blur (which can clip in html-to-image)
const LockedRow = ({ opacity = 1 }: { opacity?: number }) => (
  <div style={{ position: 'relative', opacity }}>
    <div style={{
      height: 64,
      borderRadius: 12,
      background: PANEL,
      border: `1.5px solid ${BORDER}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      gap: 14,
      overflow: 'hidden',
    }}>
      {/* Fake rank badge */}
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        background: BORDER, flexShrink: 0,
      }} />
      {/* Fake name bar */}
      <div style={{ flex: 1, height: 14, borderRadius: 999, background: BORDER }} />
      {/* Fake amount */}
      <div style={{ width: 72, height: 22, borderRadius: 8, background: BORDER, flexShrink: 0 }} />
    </div>
    {/* Lock overlay */}
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 10,
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span style={{ fontSize: 15, fontWeight: 700, color: MUTED, letterSpacing: 0.5 }}>
        Sign up to reveal
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

  return (
    <div
      ref={ref}
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: `linear-gradient(155deg, ${BG} 0%, ${BG2} 100%)`,
        color: INK,
        padding: '52px 60px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left amber accent stripe */}
      <div style={{
        position: 'absolute',
        left: 0, top: 0, bottom: 0,
        width: 10,
        background: `linear-gradient(180deg, ${AMBER_LIT} 0%, ${AMBER_DARK} 100%)`,
      }} />

      {/* Top-right decorative glow */}
      <div style={{
        position: 'absolute',
        right: -100, top: -120,
        width: 400, height: 400,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${AMBER}1A 0%, transparent 68%)`,
        pointerEvents: 'none',
      }} />

      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <PulseMark size={44} />
          <span style={{ fontWeight: 800, fontSize: 27, letterSpacing: -0.3 }}>PoliPulse</span>
        </div>
        <div style={{
          background: `${AMBER}20`,
          border: `2px solid ${AMBER}55`,
          color: AMBER,
          borderRadius: 999,
          padding: '9px 22px',
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 2.5,
          textTransform: 'uppercase' as const,
        }}>
          Follow The Money
        </div>
      </div>

      {/* ── Hero question ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          fontSize: 17, color: MUTED_LIGHT, letterSpacing: 2.5,
          textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 12,
        }}>
          Public FEC records show
        </div>
        <div style={{
          fontSize: 66, fontWeight: 900, letterSpacing: -2, lineHeight: 1.02,
          marginBottom: 0,
        }}>
          Who's bankrolling
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' as const }}>
          <span style={{
            fontSize: 72, fontWeight: 900, letterSpacing: -2.5, lineHeight: 1.02,
            color: AMBER,
          }}>
            {truncate(lastName, 16)}'s
          </span>
          <span style={{ fontSize: 60, fontWeight: 900, letterSpacing: -2, lineHeight: 1.02 }}>
            campaign?
          </span>
        </div>
      </div>

      {/* Office + raised pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36, flexWrap: 'wrap' as const }}>
        <span style={{ fontSize: 20, color: MUTED_LIGHT, fontWeight: 500 }}>{officeLine}</span>
        {data.totalRaised && data.totalRaised > 0 && (
          <>
            <span style={{ color: BORDER, fontSize: 18 }}>·</span>
            <span style={{
              background: `${AMBER}18`,
              border: `1.5px solid ${AMBER}48`,
              color: AMBER,
              borderRadius: 8,
              padding: '5px 16px',
              fontSize: 19,
              fontWeight: 800,
            }}>
              {fmtMoney(data.totalRaised)} raised
            </span>
          </>
        )}
      </div>

      {/* ── Section label ── */}
      <div style={{
        fontSize: 13, color: MUTED, letterSpacing: 3,
        textTransform: 'uppercase' as const, fontWeight: 700,
        marginBottom: 16,
      }}>
        Top donors{cycleLabel}
      </div>

      {/* ── Donor rows ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        {donors.length > 0 ? donors.map((d, i) => {
          const pct = Math.round((d.amount / maxAmount) * 100);
          const rankAlpha = ['FF', 'CC', 'AA'][i] ?? 'AA';
          return (
            <div key={`donor-${i}`}>
              <div style={{
                display: 'flex', alignItems: 'center',
                gap: 12, marginBottom: 8,
              }}>
                {/* Rank badge */}
                <span style={{
                  width: 30, height: 30, borderRadius: 7,
                  background: `${AMBER}${['20', '18', '12'][i]}`,
                  border: `1.5px solid ${AMBER}${rankAlpha}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 900, color: AMBER, flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                {/* Name */}
                <span style={{ fontSize: 22, fontWeight: 700, flex: 1, minWidth: 0 }}>
                  {truncate(d.name, 30)}
                </span>
                {/* Cause chip */}
                {d.primaryCause && (
                  <span style={{
                    fontSize: 13, color: MUTED_LIGHT,
                    background: PANEL, border: `1px solid ${BORDER}`,
                    borderRadius: 6, padding: '3px 10px', fontWeight: 600,
                    whiteSpace: 'nowrap' as const,
                  }}>
                    {truncate(d.primaryCause, 18)}
                  </span>
                )}
                {/* Amount */}
                <span style={{
                  fontSize: 23, fontWeight: 900, color: INK,
                  flexShrink: 0, minWidth: 80, textAlign: 'right' as const,
                }}>
                  {fmtMoney(d.amount)}
                </span>
              </div>
              {/* Progress bar */}
              <div style={{
                height: 9, background: BORDER, borderRadius: 999, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%', borderRadius: 999,
                  background: `linear-gradient(90deg, ${AMBER_DARK}, ${AMBER_LIT})`,
                }} />
              </div>
            </div>
          );
        }) : (
          <div style={{ fontSize: 20, color: MUTED, fontStyle: 'italic' }}>
            Donor data loading…
          </div>
        )}

        {/* Locked rows */}
        <LockedRow opacity={1} />
        <LockedRow opacity={0.7} />
      </div>

      {/* ── CTA banner ── */}
      <div style={{
        background: `linear-gradient(90deg, ${AMBER_DARK}E0, ${AMBER}E0)`,
        borderRadius: 18,
        padding: '22px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 24,
        gap: 20,
      }}>
        <div>
          <div style={{
            fontSize: 24, fontWeight: 900, color: '#0A0A0A', letterSpacing: -0.4,
            lineHeight: 1.1,
          }}>
            See every donor — free
          </div>
          <div style={{
            fontSize: 16, color: '#2A2000', marginTop: 4, fontWeight: 600,
          }}>
            Track money across every race · polipulseapp.com
          </div>
        </div>
        <div style={{
          background: '#0A0A0A',
          color: AMBER_LIT,
          borderRadius: 12,
          padding: '12px 26px',
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: 0.3,
          whiteSpace: 'nowrap' as const,
          flexShrink: 0,
        }}>
          Sign Up Free →
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 18, fontSize: 16, color: MUTED,
      }}>
        <span>Data from FEC public records</span>
        <span style={{ fontWeight: 700, color: MUTED_LIGHT }}>{data.brandHost}</span>
      </div>
    </div>
  );
});

SignupTeaserCard.displayName = 'SignupTeaserCard';
