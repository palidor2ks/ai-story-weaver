import { forwardRef } from 'react';
import { CardData, CARD_SIZE } from './types';
import { PulseMark } from './PulseMark';

interface Props {
  data: CardData;
}

const StatTile = ({
  icon,
  value,
  label,
  accent,
}: {
  icon: string;
  value: string | number;
  label: string;
  accent: string;
}) => (
  <div
    style={{
      background: 'hsl(var(--card))',
      border: '2px solid hsl(var(--border))',
      borderRadius: 28,
      padding: '40px 24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
    }}
  >
    <div style={{ fontSize: 56, color: accent, lineHeight: 1, marginBottom: 16, fontWeight: 700 }}>
      {icon}
    </div>
    <div
      style={{
        fontSize: 64,
        fontWeight: 800,
        letterSpacing: -2,
        color: 'hsl(var(--foreground))',
        lineHeight: 1,
        marginBottom: 12,
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 24,
        color: 'hsl(var(--muted-foreground))',
        textTransform: 'uppercase',
        letterSpacing: 2,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  </div>
);

/**
 * DONOR STATS — 4-up tile layout matching the donor profile header.
 */
export const DonorStatsCard = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const name = data.donorName ?? 'Donor';
  const type = data.donorType ?? 'Unknown';
  const location = data.donorLocation;

  return (
    <div
      ref={ref}
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        padding: 80,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 48,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <PulseMark size={64} />
          <div style={{ fontWeight: 700, fontSize: 32, letterSpacing: -0.5 }}>Pulse</div>
        </div>
        <div
          style={{
            background: 'hsl(var(--primary) / 0.1)',
            color: 'hsl(var(--primary))',
            padding: '12px 24px',
            borderRadius: 999,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {type}
        </div>
      </div>

      {/* Donor name */}
      <div style={{ marginBottom: 56 }}>
        <div
          style={{
            fontSize: 22,
            color: 'hsl(var(--muted-foreground))',
            textTransform: 'uppercase',
            letterSpacing: 3,
            marginBottom: 16,
            fontWeight: 600,
          }}
        >
          Donor Profile
        </div>
        <div
          style={{
            fontSize: 88,
            fontWeight: 800,
            letterSpacing: -3,
            lineHeight: 1.05,
            color: 'hsl(var(--foreground))',
          }}
        >
          {name}
        </div>
        {location && (
          <div style={{ fontSize: 28, color: 'hsl(var(--muted-foreground))', marginTop: 16 }}>
            {location}
          </div>
        )}
      </div>

      {/* Stat grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          flex: 1,
        }}
      >
        <StatTile icon="$" value={data.totalGiven ?? '$0'} label="Total Given" accent="hsl(142 71% 45%)" />
        <StatTile icon="#" value={data.donationCount ?? '0'} label="Donations" accent="hsl(var(--primary))" />
        <StatTile icon="◉" value={data.recipientCount ?? '0'} label="Recipients" accent="hsl(var(--primary))" />
        <StatTile icon="◔" value={data.cycleCount ?? 0} label="Cycles" accent="hsl(var(--primary))" />
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 48,
          fontSize: 24,
          color: 'hsl(var(--muted-foreground))',
        }}
      >
        <span>Follow the money</span>
        <span style={{ fontWeight: 700, color: 'hsl(var(--foreground))' }}>{data.brandHost}</span>
      </div>
    </div>
  );
});
DonorStatsCard.displayName = 'DonorStatsCard';
