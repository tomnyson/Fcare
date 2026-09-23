import type { AcademicAnalysisOutput } from './analysis-output';
import type { AnalysisSourceSnapshot } from './analysis-source';

export const ACADEMIC_ANALYSIS_PROVIDER = Symbol('ACADEMIC_ANALYSIS_PROVIDER');

export interface AnalysisGenerationResult {
  output: AcademicAnalysisOutput;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}

export interface AcademicAnalysisProvider {
  generate(snapshot: AnalysisSourceSnapshot): Promise<AnalysisGenerationResult>;
  /**
   * Model se duoc dung cho lan chay ke tiep. Ban ghi phan tich duoc tao truoc
   * khi job chay nen phai hoi provider dang hoat dong, khong doc thang bien moi
   * truong cua mot nha cung cap cu the.
   */
  modelName(): string;
  /** Phien ban prompt cua chinh provider — moi provider co prompt rieng. */
  promptVersion(): string;
}

/** Gia tri hop le cho bien moi truong AI_PROVIDER. */
const ANALYSIS_PROVIDER_KEYS = ['openai', 'deepseek'] as const;
type AnalysisProviderKey = (typeof ANALYSIS_PROVIDER_KEYS)[number];

/**
 * Doc AI_PROVIDER thanh mot lua chon da biet. Gia tri la va khong lam sap ung
 * dung — roi ve 'openai' de moi truong dang chay giu nguyen hanh vi cu.
 */
export function resolveAnalysisProviderKey(
  raw: string | undefined,
): AnalysisProviderKey {
  const normalized = (raw ?? '').trim().toLowerCase();
  return (ANALYSIS_PROVIDER_KEYS as readonly string[]).includes(normalized)
    ? (normalized as AnalysisProviderKey)
    : 'openai';
}
