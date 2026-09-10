'use client';

import { Input, Label, Textarea, Select } from '../ui/form';
import { ANALYSIS_RISK_LABELS, editableAnalysisOutput } from './student-analysis-helpers';

export type EditableOutput = ReturnType<typeof editableAnalysisOutput>;

export function blankEditableOutput(): EditableOutput {
  return {
    riskLevel: 'LOW',
    summary: '',
    strengths: '',
    trends: '',
    riskFactors: '',
    recommendations: '',
    notificationSummary: '',
    dataLimitations: '',
    suggestedLevel: 1,
    forcedEscalation: null,
  };
}

/**
 * Các ô văn bản của bản nháp AI. Tách riêng khỏi panel để phần điều phối
 * (query, mutation, chốt độ khẩn) không lẫn với phần trình bày form.
 */
export function AnalysisDraftFields({
  value,
  onChange,
}: {
  value: EditableOutput;
  onChange: (next: EditableOutput) => void;
}) {
  function patch(partial: Partial<EditableOutput>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="riskLevel">Mức rủi ro</Label>
          <Select
            id="riskLevel"
            value={value.riskLevel}
            onChange={(event) =>
              patch({ riskLevel: event.target.value as EditableOutput['riskLevel'] })
            }
          >
            {Object.entries(ANALYSIS_RISK_LABELS).map(([option, label]) => (
              <option key={option} value={option}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="notificationSummary">Tóm tắt thông báo</Label>
          <Input
            id="notificationSummary"
            value={value.notificationSummary}
            onChange={(event) => patch({ notificationSummary: event.target.value })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="summary">Tóm tắt phân tích</Label>
        <Textarea
          id="summary"
          value={value.summary}
          onChange={(event) => patch({ summary: event.target.value })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="strengths">Điểm mạnh (mỗi dòng 1 ý)</Label>
          <Textarea
            id="strengths"
            value={value.strengths}
            onChange={(event) => patch({ strengths: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="recommendations">Khuyến nghị (mỗi dòng 1 ý)</Label>
          <Textarea
            id="recommendations"
            value={value.recommendations}
            onChange={(event) => patch({ recommendations: event.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="trends">Xu hướng (`finding | evidence` mỗi dòng)</Label>
          <Textarea
            id="trends"
            value={value.trends}
            onChange={(event) => patch({ trends: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="riskFactors">Yếu tố rủi ro (`finding | evidence` mỗi dòng)</Label>
          <Textarea
            id="riskFactors"
            value={value.riskFactors}
            onChange={(event) => patch({ riskFactors: event.target.value })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="dataLimitations">Giới hạn dữ liệu (mỗi dòng 1 ý)</Label>
        <Textarea
          id="dataLimitations"
          value={value.dataLimitations}
          onChange={(event) => patch({ dataLimitations: event.target.value })}
        />
      </div>
    </div>
  );
}
