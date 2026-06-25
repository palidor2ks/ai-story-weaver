import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, ExternalLink, BookOpen, Bell } from 'lucide-react';
import { useBill } from '@/hooks/useBill';

const formatDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getStatusBadge = (status: string | null, maxActionCode: number | null) => {
  const s = (status ?? '').toUpperCase();
  if (s === 'ENACTED') {
    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#1B7A4B] text-white font-mono">ENACTED</span>;
  }
  if (s.includes('PASSED SENATE') || s === 'PASSED_SENATE') {
    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#182B7A] text-white border border-white/20 font-mono">PASSED SENATE</span>;
  }
  if (s.includes('PASSED HOUSE') || s === 'PASSED_HOUSE') {
    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#182B7A] text-white border border-white/20 font-mono">PASSED HOUSE</span>;
  }
  if (s.includes('COMMITTEE') || (maxActionCode !== null && maxActionCode >= 3 && s === 'INTRODUCED')) {
    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#C19A3F] text-white font-mono">IN COMMITTEE</span>;
  }
  return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/20 text-white font-mono">INTRODUCED</span>;
};

type StepState = 'done' | 'pending';

const Step = ({ label, state, number }: { label: string; state: StepState; number: number }) => (
  <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        state === 'done'
          ? 'bg-[#182B7A]'
          : 'bg-[#F0EFF4] border border-[#9A9EB5]'
      }`}
    >
      {state === 'done' ? (
        <CheckCircle className="w-4 h-4 text-white" />
      ) : (
        <span className="text-xs font-mono font-bold text-[#9A9EB5]">{number}</span>
      )}
    </div>
    <span
      className={`text-xs text-center leading-tight font-mono ${
        state === 'done' ? 'text-[#182B7A] font-bold' : 'text-[#9A9EB5]'
      }`}
    >
      {label}
    </span>
  </div>
);

const SponsorCard = ({
  sponsorName,
  sponsorBioguideId,
  sponsorParty,
  sponsorState,
}: {
  sponsorName: string | null;
  sponsorBioguideId: string | null;
  sponsorParty: string | null;
  sponsorState: string | null;
}) => {
  if (!sponsorName) return null;

  const initials = sponsorName
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join('');

  const partyColor =
    sponsorParty?.toUpperCase() === 'D'
      ? 'bg-blue-600'
      : sponsorParty?.toUpperCase() === 'R'
        ? 'bg-red-600'
        : 'bg-[#9A9EB5]';

  const inner = (
    <div className="flex items-center gap-3">
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${partyColor}`}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-[#3A3E5C] text-sm truncate">{sponsorName}</span>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-[#182B7A] text-white">
            SPONSOR
          </span>
        </div>
        {(sponsorParty || sponsorState) && (
          <p className="text-xs text-[#9A9EB5] mt-0.5">
            {[sponsorParty, sponsorState].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );

  if (sponsorBioguideId) {
    return (
      <Link to={`/candidate/${sponsorBioguideId}/profile`} className="block hover:opacity-80 transition-opacity">
        {inner}
      </Link>
    );
  }
  return inner;
};

export const BillDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: bill, isLoading, error } = useBill(id);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#182B7A] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#9A9EB5] font-mono">Loading bill…</p>
        </div>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="min-h-screen bg-[#F5F6FA] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-[#C8102E] font-mono text-sm font-bold">BILL NOT FOUND</p>
        <p className="text-[#9A9EB5] text-sm text-center">
          {error instanceof Error ? error.message : 'This bill could not be loaded.'}
        </p>
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-[#182B7A] underline underline-offset-2"
        >
          Go back
        </button>
      </div>
    );
  }

  const billLabel =
    bill.bill_type && bill.bill_number
      ? `${bill.bill_type.toUpperCase()} ${bill.bill_number}`
      : bill.id;

  const status = bill.status ?? '';
  const maxCode = bill.max_action_code ?? 0;

  const stepIntroduced: StepState = 'done';
  const stepCommittee: StepState =
    maxCode >= 3 || (status !== '' && status.toUpperCase() !== 'INTRODUCED') ? 'done' : 'pending';
  const stepHouse: StepState = bill.passed_house ? 'done' : 'pending';
  const stepSenate: StepState = bill.passed_senate ? 'done' : 'pending';
  const stepSigned: StepState = status.toUpperCase() === 'ENACTED' ? 'done' : 'pending';

  const summaryText = bill.summary ?? bill.description ?? null;
  const introducedDate = bill.introduced_date ?? bill.latest_action_date ?? null;

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      {/* Header */}
      <div
        className="relative px-4 pt-safe-top pb-8"
        style={{ background: 'linear-gradient(150deg, #182B7A, #0C1A52)' }}
      >
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors mt-4 mb-5 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="flex items-start justify-between gap-3 mb-2">
            <span className="font-mono text-xs text-white/70 uppercase tracking-widest pt-0.5">
              {billLabel}
            </span>
            {getStatusBadge(bill.status, bill.max_action_code)}
          </div>

          <h1 className="text-xl font-bold text-white leading-snug mb-3">{bill.name}</h1>

          <p className="text-sm text-white/60">
            {bill.congress ? `${bill.congress}th Congress` : ''}
            {bill.congress && bill.topic ? ' · ' : ''}
            {bill.topic ?? ''}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-20">
        {/* Sponsor card — overlaps header */}
        {bill.sponsor_name && (
          <div className="bg-white rounded-2xl shadow-md p-4 -mt-4 mb-4">
            <p className="text-xs font-mono font-bold text-[#9A9EB5] uppercase tracking-wider mb-3">
              Sponsor
            </p>
            <SponsorCard
              sponsorName={bill.sponsor_name}
              sponsorBioguideId={bill.sponsor_bioguide_id}
              sponsorParty={bill.sponsor_party}
              sponsorState={bill.sponsor_state}
            />
          </div>
        )}

        {/* What it does */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <p className="font-mono text-xs font-bold text-[#C8102E] uppercase tracking-wider mb-2">
            What It Does
          </p>
          <p className="text-sm text-[#3A3E5C] leading-relaxed">
            {summaryText ?? 'Summary not yet available.'}
          </p>
        </div>

        {/* Bill Progress */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <p className="font-mono text-xs font-bold text-[#C8102E] uppercase tracking-wider mb-4">
            Bill Progress
          </p>
          <div className="flex items-start gap-1">
            <Step label="Introduced" state={stepIntroduced} number={1} />
            <div className="flex-1 h-0.5 bg-[#E5E7EB] mt-4 mx-1" />
            <Step label="Committee" state={stepCommittee} number={2} />
            <div className="flex-1 h-0.5 bg-[#E5E7EB] mt-4 mx-1" />
            <Step label="Passed House" state={stepHouse} number={3} />
            <div className="flex-1 h-0.5 bg-[#E5E7EB] mt-4 mx-1" />
            <Step label="Passed Senate" state={stepSenate} number={4} />
            <div className="flex-1 h-0.5 bg-[#E5E7EB] mt-4 mx-1" />
            <Step label="Signed / Enacted" state={stepSigned} number={5} />
          </div>
        </div>

        {/* Key Facts */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <p className="font-mono text-xs font-bold text-[#C8102E] uppercase tracking-wider mb-3">
            Key Facts
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <p className="text-xs text-[#9A9EB5] font-mono uppercase tracking-wide mb-0.5">Introduced</p>
              <p className="text-sm font-semibold text-[#3A3E5C]">{formatDate(introducedDate)}</p>
            </div>
            <div>
              <p className="text-xs text-[#9A9EB5] font-mono uppercase tracking-wide mb-0.5">Status</p>
              <p className="text-sm font-semibold text-[#3A3E5C]">{bill.status ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[#9A9EB5] font-mono uppercase tracking-wide mb-0.5">Cosponsors</p>
              <p className="text-sm font-semibold text-[#3A3E5C]">
                {bill.cosponsor_count != null ? bill.cosponsor_count.toString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#9A9EB5] font-mono uppercase tracking-wide mb-0.5">Congress</p>
              <p className="text-sm font-semibold text-[#3A3E5C]">
                {bill.congress ? `${bill.congress}th Congress` : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Latest Action */}
        {(bill.latest_action_text || bill.latest_action_date) && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-6">
            <p className="font-mono text-xs font-bold text-[#C8102E] uppercase tracking-wider mb-2">
              Latest Action
            </p>
            {bill.latest_action_date && (
              <p className="text-xs text-[#9A9EB5] font-mono mb-1">{formatDate(bill.latest_action_date)}</p>
            )}
            {bill.latest_action_text && (
              <p className="text-sm text-[#3A3E5C] leading-relaxed">{bill.latest_action_text}</p>
            )}
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          {bill.url ? (
            <a
              href={bill.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#182B7A] text-white text-sm font-semibold hover:bg-[#0C1A52] transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Read Full Text
              <ExternalLink className="w-3.5 h-3.5 opacity-60" />
            </a>
          ) : (
            <button
              disabled
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#182B7A]/40 text-white/50 text-sm font-semibold cursor-not-allowed"
            >
              <BookOpen className="w-4 h-4" />
              Read Full Text
            </button>
          )}
          <button className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-[#182B7A] text-[#182B7A] text-sm font-semibold hover:bg-[#182B7A]/5 transition-colors">
            <Bell className="w-4 h-4" />
            Track Bill
          </button>
        </div>
      </div>
    </div>
  );
};
