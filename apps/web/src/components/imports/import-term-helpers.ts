const TERM_PATTERN = /^[A-Z]{2}\d{2}$/;

export function isTermValid(term: string): boolean {
  return TERM_PATTERN.test(term);
}

export function resolveInitialTerm(
  currentTermCode?: string | null,
  availableTerms?: readonly { code: string }[],
): string {
  if (currentTermCode && currentTermCode.trim()) {
    return currentTermCode.trim();
  }
  if (availableTerms && availableTerms.length > 0 && availableTerms[0]?.code) {
    return availableTerms[0].code;
  }
  return 'SU25';
}
