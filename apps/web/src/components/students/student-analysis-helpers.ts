import type { Enrollment, StudentAnalysisEvidenceItem, StudentAnalysisOutput } from '../../lib/types';

export const ANALYSIS_STATUS_LABELS: Record<
  | 'QUEUED'
  | 'GENERATING'
  | 'DRAFT'
  | 'FAILED'
  | 'SUPERSEDED'
  | 'SEND_QUEUED'
  | 'SENT',
  string
> = {
  QUEUED: 'Đang xếp hàng',
  GENERATING: 'Đang tạo',
  DRAFT: 'Bản nháp',
  FAILED: 'Thất bại',
  SUPERSEDED: 'Đã thay thế',
  SEND_QUEUED: 'Đang gửi',
  SENT: 'Đã gửi',
};

export const ANALYSIS_RISK_LABELS: Record<'LOW' | 'MEDIUM' | 'HIGH', string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
};

export function uniqueTermsFromEnrollments(enrollments: Enrollment[]): string[] {
  return [...new Set(enrollments.map((item) => item.classSection?.term).filter(Boolean) as string[])]
    .sort((left, right) => right.localeCompare(left));
}

export function toLineBlock(values: string[]): string {
  return values.join('\n');
}

export function fromLineBlock(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function evidenceToLines(items: StudentAnalysisEvidenceItem[]): string {
  return items.map((item) => `${item.finding} | ${item.evidence}`).join('\n');
}

export function evidenceFromLines(value: string): StudentAnalysisEvidenceItem[] {
  return value
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [finding, ...evidenceParts] = row.split('|');
      return {
        finding: finding.trim(),
        evidence: evidenceParts.join('|').trim(),
      };
    })
    .filter((item) => item.finding && item.evidence);
}

export function editableAnalysisOutput(output: StudentAnalysisOutput) {
  return {
    riskLevel: output.riskLevel,
    summary: output.summary,
    strengths: toLineBlock(output.strengths),
    trends: evidenceToLines(output.trends),
    riskFactors: evidenceToLines(output.riskFactors),
    recommendations: toLineBlock(output.recommendations),
    notificationSummary: output.notificationSummary,
    dataLimitations: toLineBlock(output.dataLimitations),
    // Hai trường ép cấp đi kèm nguyên vẹn: người duyệt không sửa ở form này,
    // nhưng schema phía API bắt buộc phải có khi PATCH bản nháp.
    suggestedLevel: output.suggestedLevel,
    forcedEscalation: output.forcedEscalation,
  };
}

export function parseEditableAnalysisOutput(form: ReturnType<typeof editableAnalysisOutput>): StudentAnalysisOutput {
  return {
    riskLevel: form.riskLevel,
    summary: form.summary.trim(),
    strengths: fromLineBlock(form.strengths),
    trends: evidenceFromLines(form.trends),
    riskFactors: evidenceFromLines(form.riskFactors),
    recommendations: fromLineBlock(form.recommendations),
    notificationSummary: form.notificationSummary.trim(),
    dataLimitations: fromLineBlock(form.dataLimitations),
    suggestedLevel: form.suggestedLevel,
    forcedEscalation: form.forcedEscalation,
  };
}
