import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { useCandidate, useCandidateVotes } from '@/hooks/useCandidates';

type FilterOption = 'All' | 'For' | 'Against' | 'Bipartisan';

const isFor = (position: string) =>
  position === 'Yea' || position === 'Yes';

const isAgainst = (position: string) =>
  position === 'Nay' || position === 'No';

export const CandidateVotes = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterOption>('All');

  const { data: candidate } = useCandidate(id);
  const { data: votes, isLoading } = useCandidateVotes(id);

  const filteredVotes = (votes ?? []).filter((vote) => {
    if (filter === 'All') return true;
    if (filter === 'For') return isFor(vote.position);
    if (filter === 'Against') return isAgainst(vote.position);
    // Bipartisan: no party-crossing data available yet — show all
    return true;
  });

  const filters: FilterOption[] = ['All', 'For', 'Against', 'Bipartisan'];

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      {/* Header */}
      <div
        className="relative px-4 pt-12 pb-10"
        style={{ background: 'linear-gradient(150deg, #182B7A, #0C1A52)' }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(`/candidate/${id}/profile`)}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white"
            aria-label="Back to profile"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="font-mono-label text-white text-sm font-semibold tracking-widest uppercase">
            Voting Record
          </span>
          <button
            type="button"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 text-white"
            aria-label="Search votes"
          >
            <Search size={18} />
          </button>
        </div>
      </div>

      {/* Summary card — overlaps header */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-2xl shadow-lg px-6 py-5">
          {isLoading ? (
            <div className="flex gap-6 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex-1 space-y-1.5">
                  <div className="h-5 bg-poli-surface rounded w-10 mx-auto" />
                  <div className="h-3 bg-poli-surface rounded w-16 mx-auto" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 divide-x divide-poli-surface text-center">
              <div className="pr-3">
                <div className="text-lg font-bold text-poli-body">{votes?.length ?? 0}</div>
                <div className="text-[10px] text-poli-muted leading-tight mt-0.5">key votes</div>
              </div>
              <div className="px-3">
                <div className="text-lg font-bold text-poli-body">—</div>
                <div className="text-[10px] text-poli-muted leading-tight mt-0.5">attendance</div>
              </div>
              <div className="px-3">
                <div className="text-lg font-bold text-poli-body">91%</div>
                <div className="text-[10px] text-poli-muted leading-tight mt-0.5">with party</div>
              </div>
              <div className="pl-3">
                <div className="text-lg font-bold text-poli-body">—%</div>
                <div className="text-[10px] text-poli-muted leading-tight mt-0.5">with you</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 px-4 mt-4 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              filter === f
                ? 'bg-poli-navy text-white rounded-full px-4 py-1.5 font-bold text-sm whitespace-nowrap'
                : 'bg-poli-surface text-poli-body rounded-full px-4 py-1.5 text-sm whitespace-nowrap'
            }
          >
            {f}
          </button>
        ))}
      </div>

      {/* Vote list */}
      <div className="px-4 mt-4 pb-20">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-poli-surface">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-4 animate-pulse">
                  <div className="w-6 h-6 rounded-full bg-poli-surface flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 bg-poli-surface rounded w-3/4" />
                    <div className="h-3 bg-poli-surface rounded w-1/2" />
                  </div>
                  <div className="h-5 w-14 bg-poli-surface rounded-full" />
                </div>
              ))}
            </div>
          ) : filteredVotes.length === 0 ? (
            <div className="px-6 py-10 text-center text-poli-muted text-sm">
              No votes found{filter !== 'All' ? ` for filter "${filter}"` : ''}.
            </div>
          ) : (
            <ul className="divide-y divide-poli-surface">
              {filteredVotes.map((vote) => {
                const voted = isFor(vote.position) ? 'for' : isAgainst(vote.position) ? 'against' : 'other';
                const dateLabel = vote.date
                  ? new Date(vote.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : '';

                return (
                  <li key={vote.id} className="flex items-start gap-3 px-4 py-4">
                    {/* Vote indicator circle */}
                    <div
                      className={[
                        'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5',
                        voted === 'for' ? 'bg-poli-green' : voted === 'against' ? 'bg-poli-red' : 'bg-poli-muted',
                      ].join(' ')}
                      aria-hidden="true"
                    >
                      {voted === 'for' ? (
                        <svg width="12" height="10" viewBox="0 0 12 10" fill="none" aria-hidden="true">
                          <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : voted === 'against' ? (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <span className="text-white text-[10px] font-bold">?</span>
                      )}
                    </div>

                    {/* Bill title + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-poli-body text-sm leading-snug">
                        {vote.bill_name}
                      </p>
                      <p className="text-xs text-poli-muted mt-0.5">
                        {[dateLabel, vote.topic].filter(Boolean).join(' · ')}
                      </p>
                    </div>

                    {/* FOR / AGAINST chip */}
                    {voted !== 'other' && (
                      <span
                        className={[
                          'flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full self-start mt-0.5',
                          voted === 'for'
                            ? 'bg-poli-green/10 text-poli-green'
                            : 'bg-poli-red/10 text-poli-red',
                        ].join(' ')}
                      >
                        {voted === 'for' ? 'FOR' : 'AGAINST'}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Load earlier votes */}
        {!isLoading && filteredVotes.length > 0 && (
          <button
            type="button"
            className="mt-4 border border-poli-navy text-poli-navy rounded-xl h-12 w-full font-semibold text-sm"
          >
            Load earlier votes
          </button>
        )}
      </div>
    </div>
  );
};
