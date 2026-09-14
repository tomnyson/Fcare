import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { Term } from './types';

export function useCurrentTerm() {
  return useQuery({
    queryKey: ['terms', 'current'],
    queryFn: () => apiFetch<Term | null>('/terms/current'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTerms() {
  return useQuery({
    queryKey: ['terms'],
    queryFn: () => apiFetch<Term[]>('/terms'),
    staleTime: 5 * 60 * 1000,
  });
}
