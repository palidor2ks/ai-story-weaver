import { useState, useCallback } from 'react';
import { AdminError } from '@/components/admin/RecentErrorsPanel';

export function useAdminErrors() {
  const [errors, setErrors] = useState<AdminError[]>([]);

  const addError = useCallback((
    type: AdminError['type'],
    candidateId: string,
    candidateName: string,
    message: string
  ) => {
    const newError: AdminError = {
      id: `${Date.now()}-${candidateId}`,
      type,
      candidateId,
      candidateName,
      message,
      timestamp: new Date()
    };

    setErrors(prev => [newError, ...prev].slice(0, 100)); // Keep last 100 errors
  }, []);

  const dismissError = useCallback((errorId: string) => {
    setErrors(prev => prev.filter(e => e.id !== errorId));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const getErrorsForCandidate = useCallback((candidateId: string) => {
    return errors.filter(e => e.candidateId === candidateId);
  }, [errors]);

  const hasRecentError = useCallback((candidateId: string, type?: AdminError['type']) => {
    const cutoff = Date.now() - 5 * 60 * 1000; // Last 5 minutes
    return errors.some(e => 
      e.candidateId === candidateId && 
      e.timestamp.getTime() > cutoff &&
      (!type || e.type === type)
    );
  }, [errors]);

  return {
    errors,
    addError,
    dismissError,
    clearErrors,
    getErrorsForCandidate,
    hasRecentError
  };
}
