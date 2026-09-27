import type { ReactNode } from 'react';
import type { StudentAnalysisEvidenceItem, StudentAnalysisOutput } from '../../lib/types';

interface AnalysisResultViewProps {
  output: StudentAnalysisOutput;
}

function ResultSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function EvidenceList({ items }: { items: readonly StudentAnalysisEvidenceItem[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={`${item.finding}|${item.evidence}`} className="rounded-md bg-white px-3 py-2">
          <p className="font-medium text-ink">{item.finding}</p>
          <p className="mt-0.5 text-xs text-muted">{item.evidence}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Kết quả AI đề xuất, chỉ đọc. Giảng viên không tạo/sửa bản AI ở đây nữa — AI tự
 * chạy sau khi lưu nhận xét; muốn đổi nội dung gửi đi thì chọn "tự soạn" ở bước gửi.
 */
export function AnalysisResultView({ output }: AnalysisResultViewProps) {
  return (
    <div className="mt-4 space-y-4">
      {output.summary ? (
        <p className="text-sm leading-relaxed text-ink">{output.summary}</p>
      ) : null}
      {output.riskFactors.length > 0 ? (
        <ResultSection title="Yếu tố rủi ro">
          <EvidenceList items={output.riskFactors} />
        </ResultSection>
      ) : null}
      {output.trends.length > 0 ? (
        <ResultSection title="Xu hướng">
          <EvidenceList items={output.trends} />
        </ResultSection>
      ) : null}
      {output.strengths.length > 0 ? (
        <ResultSection title="Điểm mạnh">
          <BulletList items={output.strengths} />
        </ResultSection>
      ) : null}
      {output.recommendations.length > 0 ? (
        <ResultSection title="Khuyến nghị">
          <BulletList items={output.recommendations} />
        </ResultSection>
      ) : null}
      {output.dataLimitations.length > 0 ? (
        <ResultSection title="Giới hạn dữ liệu">
          <BulletList items={output.dataLimitations} />
        </ResultSection>
      ) : null}
    </div>
  );
}
