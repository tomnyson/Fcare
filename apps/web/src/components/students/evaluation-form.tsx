'use client';

import {
  ACADEMIC_BAND_DESCRIPTIONS,
  ATTITUDE_BAND_DESCRIPTIONS,
  BAND_CLASSIFICATIONS,
  BAND_RANGE_LABELS,
  CRITERION_LABELS,
  CRITERION_POINTS,
  EVALUATION_CRITERIA,
  evaluationGuidance,
  SCORE_BANDS,
  scoreBand,
  type EvaluationCriterion,
  type ScoreBand,
} from '@fcare/shared-types';
import { Button } from '@fcare/ui-kit';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import {
  absenceSourceHint,
  initialAbsentValue,
  parseAbsentInput,
} from '../../lib/evaluation-absence';
import type { ClassSection, Evaluation } from '../../lib/types';
import { FormError, Input, Label, Select, Textarea } from '../ui/form';
import { EvaluationGuidancePanel, SuggestedLevelBadge } from './evaluation-guidance';
import {
  buildAlertReason,
  EvaluationHandoffStep,
  raiseEvaluationAlert,
} from './evaluation-handoff-step';

/**
 * Form nhập nhận xét theo tiêu chí DRS. Giảng viên chọn DẢI điểm (đúng ghi chú
 * cuối tài liệu II.1) chứ không gõ số, giá trị gửi lên là điểm đại diện của dải.
 */

const BAND_SCORE: Record<ScoreBand, number> = {
  '10-9': 10,
  '8-7': 8,
  '6-5': 6,
  '4-3': 4,
  '2-1': 2,
};

const DEFAULT_BAND: ScoreBand = '8-7';

const PERSONAL_CRITERIA = EVALUATION_CRITERIA.filter((criterion) => criterion.startsWith('P_'));
const ACADEMIC_CRITERIA = EVALUATION_CRITERIA.filter((criterion) => criterion.startsWith('H_'));

function BandGroup({
  name,
  legend,
  descriptions,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  descriptions: Record<ScoreBand, string>;
  value: ScoreBand;
  onChange: (band: ScoreBand) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-semibold text-ink">{legend}</legend>
      <div className="space-y-1">
        {SCORE_BANDS.map((band) => (
          <label
            key={band}
            className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-2 text-sm text-ink transition-colors ${
              value === band
                ? 'border-fpt-orange/40 bg-fpt-orange-50'
                : 'border-transparent hover:bg-surface-raised'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={band}
              checked={value === band}
              onChange={() => onChange(band)}
              className="mt-0.5 shrink-0"
            />
            <span>
              <span className="font-semibold">{BAND_CLASSIFICATIONS[band]}</span>{' '}
              <span className="text-xs text-muted">({BAND_RANGE_LABELS[band]} điểm)</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">
                {descriptions[band]}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CriteriaGroup({
  legend,
  hint,
  criteria,
  selected,
  onToggle,
}: {
  legend: string;
  hint: string;
  criteria: readonly EvaluationCriterion[];
  selected: ReadonlySet<EvaluationCriterion>;
  onToggle: (criterion: EvaluationCriterion) => void;
}) {
  return (
    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-semibold text-ink">{legend}</legend>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      <div className="space-y-1.5">
        {criteria.map((criterion) => (
          <label key={criterion} className="flex cursor-pointer gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={selected.has(criterion)}
              onChange={() => onToggle(criterion)}
              className="mt-1 shrink-0"
            />
            <span>
              {CRITERION_LABELS[criterion]}{' '}
              <span className="text-muted">+{CRITERION_POINTS[criterion]} điểm</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RaiseAlertToggle({
  checked,
  level,
  onChange,
}: {
  checked: boolean;
  level: number;
  onChange: (checked: boolean) => void;
}) {
  // Khối nổi bật nhất form: nền cam, viền nhấn trái, chuông và công tắc lớn —
  // giảng viên hay bỏ sót ô tích nhỏ ở cuối form.
  return (
    <label
      data-raise-alert-callout
      className={`group flex cursor-pointer items-center gap-3.5 rounded-lg border-2 border-l-4 px-4 py-3.5 transition-[background-color,border-color,box-shadow] duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-fpt-orange has-[:focus-visible]:ring-offset-2 ${
        checked
          ? 'border-fpt-orange bg-fpt-orange-50 shadow-[0_0_0_4px_rgb(242_114_39/0.15)]'
          : 'border-fpt-orange/50 border-l-fpt-orange bg-fpt-orange-50 hover:border-fpt-orange hover:shadow-md'
      }`}
    >
      <span
        data-raise-alert-bell
        aria-hidden="true"
        className={`relative hidden size-10 shrink-0 place-items-center sm:grid rounded-full transition-colors ${
          checked
            ? 'bg-fpt-orange text-white'
            : 'bg-white text-fpt-orange ring-1 ring-fpt-orange/40'
        }`}
      >
        {!checked && level >= 3 ? (
          <span className="absolute inset-0 rounded-full bg-fpt-orange/30 motion-safe:animate-ping" />
        ) : null}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="relative size-5"
        >
          <path
            d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-base font-bold text-fpt-blue-900">
          Phát cảnh báo khi lưu
          <SuggestedLevelBadge level={level} />
        </span>
        <span
          className={`mt-0.5 block text-xs font-semibold ${checked ? 'text-fpt-orange-600' : 'text-ink'}`}
        >
          {checked
            ? `Đang bật — lưu xong sẽ phát cảnh báo Mức ${level}.`
            : 'Đang tắt — chỉ lưu nhận xét, chưa phát cảnh báo.'}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-muted">
          Hệ thống tự phát cảnh báo theo mức đề xuất từ điểm và tiêu chí bạn vừa nhập, gắn lớp học
          phần này và kích hoạt AI tổng hợp học kỳ. Đổi điểm thì mức cảnh báo cập nhật theo.
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        data-raise-alert-toggle
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? 'bg-fpt-orange' : 'bg-border group-hover:bg-fpt-orange/40'
        }`}
      >
        <span
          className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </label>
  );
}

interface EvaluationFormProps {
  studentId: string;
  term: string;
  /** Lớp học phần người dùng được nhận xét trong kỳ (đã lọc ở tầng gọi). */
  sections: ClassSection[];
  /**
   * Nhận xét của chính người dùng trong kỳ. Mỗi lớp học phần chỉ có một bản
   * (@@unique ở API): chọn lớp đã nhận xét thì form chuyển sang sửa bản cũ,
   * không tạo thêm — trước đây gửi lại là dính lỗi trùng.
   */
  ownEvaluations: Evaluation[];
  /** Số buổi nghỉ theo dữ liệu điểm danh, theo id lớp học phần — để điền sẵn. */
  systemAbsences?: Readonly<Record<string, number | null>>;
  onSaved: (term: string) => void;
  onCancel: () => void;
  /** ID lớp học phần chọn sẵn khi mở modal từ danh sách lớp. */
  initialSectionId?: string;
  /** Dòng thông tin sinh viên — ghim cùng lớp học phần và số buổi vắng. */
  summary?: ReactNode;
}

export function EvaluationForm({
  studentId,
  term,
  sections,
  ownEvaluations,
  systemAbsences = {},
  onSaved,
  onCancel,
  initialSectionId,
  summary,
}: EvaluationFormProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const defaultSectionId =
    (initialSectionId && sections.some((s) => s.id === initialSectionId) ? initialSectionId : '') ||
    (sections.length === 1 ? (sections[0]?.id ?? '') : '');

  const existingInitial = defaultSectionId
    ? ownEvaluations.find((evaluation) => evaluation.classSectionId === defaultSectionId)
    : undefined;

  const [classSectionId, setClassSectionId] = useState(defaultSectionId);
  const [academicBand, setAcademicBand] = useState<ScoreBand>(
    existingInitial ? scoreBand(existingInitial.academicScore) : DEFAULT_BAND,
  );
  const [attitudeBand, setAttitudeBand] = useState<ScoreBand>(
    existingInitial ? scoreBand(existingInitial.attitudeScore) : DEFAULT_BAND,
  );
  const [criteria, setCriteria] = useState<ReadonlySet<EvaluationCriterion>>(
    new Set(existingInitial ? existingInitial.criteria.map((mark) => mark.criterion) : []),
  );

  const [absentInput, setAbsentInput] = useState(
    initialAbsentValue(existingInitial?.absentSessions, systemAbsences[defaultSectionId]),
  );

  const [handoffStep, setHandoffStep] = useState(false);
  const [submittedNote, setSubmittedNote] = useState('');
  /** Bật thì lưu xong tự phát cảnh báo theo mức hệ thống đề xuất từ điểm vừa nhập. */
  const [raiseAlert, setRaiseAlert] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  const academicScore = BAND_SCORE[academicBand];
  const attitudeScore = BAND_SCORE[attitudeBand];
  const absentSessions = parseAbsentInput(absentInput);
  const guidanceScores = { academicScore, attitudeScore, criteria: [...criteria], absentSessions };
  const suggestedLevel = evaluationGuidance(guidanceScores).suggestedLevel;
  const existing = ownEvaluations.find(
    (evaluation) => evaluation.classSectionId === classSectionId,
  );

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      existing
        ? apiFetch<Evaluation>(`/evaluations/${existing.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : apiFetch<Evaluation>('/evaluations', {
            method: 'POST',
            body: JSON.stringify(payload),
          }),
    onSuccess: async (_saved, payload) => {
      setError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['evaluations', studentId] }),
        queryClient.invalidateQueries({ queryKey: ['risk-score', studentId, term] }),
      ]);
      const currentGuidance = evaluationGuidance(guidanceScores);
      if (raiseAlert) {
        await raiseAlertAfterSave(
          currentGuidance,
          typeof payload.note === 'string' ? payload.note : '',
        );
        return;
      }
      // Nếu đề xuất mức 3 (Nguy cơ cao) hoặc 4 (Khẩn cấp), chuyển sang bước tương tác tiếp theo
      if (currentGuidance.suggestedLevel >= 3) {
        setHandoffStep(true);
      } else {
        onSaved(term);
      }
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra.'),
  });

  /**
   * Nhận xét đã lưu — phát cảnh báo đúng mức hệ thống đề xuất. Lỗi thì chuyển sang
   * bước tiếp theo (có nút phát lại) thay vì mất cảnh báo trong im lặng.
   */
  async function raiseAlertAfterSave(
    guidance: ReturnType<typeof evaluationGuidance>,
    note: string,
  ) {
    try {
      await raiseEvaluationAlert({
        studentId,
        term,
        level: guidance.suggestedLevel,
        classSectionId: classSectionId || undefined,
        reason: buildAlertReason({
          term,
          criterionLabels: guidance.criterionLabels,
          note,
          suggestedLevel: guidance.suggestedLevel,
          academicDescription: guidance.academicDescription,
          attitudeDescription: guidance.attitudeDescription,
        }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['students'] }),
        queryClient.invalidateQueries({ queryKey: ['student-term-analysis'] }),
      ]);
      onSaved(term);
    } catch (err) {
      setHandoffError(
        `Đã lưu nhận xét nhưng chưa phát được cảnh báo${
          err instanceof ApiError ? `: ${err.message}` : '.'
        } Bấm "Phát cảnh báo" bên dưới để thử lại.`,
      );
      setHandoffStep(true);
    }
  }

  /** Đổi lớp thì nạp lại nội dung bản nhận xét cũ của lớp đó (nếu có). */
  function selectSection(id: string) {
    setClassSectionId(id);
    setError('');
    const current = ownEvaluations.find((evaluation) => evaluation.classSectionId === id);
    setAcademicBand(current ? scoreBand(current.academicScore) : DEFAULT_BAND);
    setAttitudeBand(current ? scoreBand(current.attitudeScore) : DEFAULT_BAND);
    setCriteria(new Set(current ? current.criteria.map((mark) => mark.criterion) : []));
    setAbsentInput(initialAbsentValue(current?.absentSessions, systemAbsences[id]));
  }

  function toggleCriterion(criterion: EvaluationCriterion) {
    setCriteria((current) => {
      const next = new Set(current);
      if (next.has(criterion)) {
        next.delete(criterion);
      } else {
        next.add(criterion);
      }
      return next;
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const note = String(form.get('note') ?? '').trim();
    setSubmittedNote(note);
    // PATCH chỉ nhận phần nội dung; sinh viên/lớp/học kỳ đã cố định ở bản cũ.
    saveMutation.mutate({
      ...(existing ? {} : { studentId, classSectionId, term }),
      academicScore,
      attitudeScore,
      ...(absentSessions === null ? {} : { absentSessions }),
      criteria: [...criteria],
      ...(note === '' ? {} : { note }),
    });
  }

  if (handoffStep) {
    const currentGuidance = evaluationGuidance(guidanceScores);
    return (
      <EvaluationHandoffStep
        studentId={studentId}
        term={term}
        classSectionId={classSectionId || undefined}
        suggestedLevel={currentGuidance.suggestedLevel}
        criterionLabels={currentGuidance.criterionLabels}
        note={submittedNote}
        academicDescription={currentGuidance.academicDescription}
        attitudeDescription={currentGuidance.attitudeDescription}
        lecturerActions={currentGuidance.lecturerActions}
        studentAffairsActions={currentGuidance.studentAffairsActions}
        initialError={handoffError}
        onComplete={() => onSaved(term)}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Ghim ở đầu vùng cuộn của modal (từ sm): kéo xem tiêu chí vẫn thấy đang
          nhận xét ai, lớp nào, vắng mấy buổi. Điện thoại thấp nên để cuộn thường. */}
      <div
        data-evaluation-pinned
        className="-mx-6 space-y-3 border-b border-border bg-white px-6 pb-3 sm:sticky sm:top-0 sm:z-10"
      >
        {summary}
        <FormError>{error}</FormError>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <div>
            <Label htmlFor="classSectionId">Lớp học phần</Label>
            <Select
              id="classSectionId"
              name="classSectionId"
              required
              value={classSectionId}
              onChange={(event) => selectSection(event.target.value)}
            >
              <option value="" disabled>
                Chọn lớp học phần
              </option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.code}
                  {section.subject ? ` — ${section.subject.name}` : ''}
                  {ownEvaluations.some((evaluation) => evaluation.classSectionId === section.id)
                    ? ' (đã nhận xét)'
                    : ''}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted">
              {existing
                ? 'Bạn đã nhận xét lớp này — lưu lại sẽ cập nhật bản cũ và chạy lại phân tích AI.'
                : `Mỗi lớp học phần chỉ có một bản nhận xét trong học kỳ ${term}.`}
            </p>
          </div>
          <div>
            <Label htmlFor="absentSessions">Số buổi đã vắng</Label>
            <Input
              id="absentSessions"
              name="absentSessions"
              type="number"
              min={0}
              max={100}
              value={absentInput}
              onChange={(event) => setAbsentInput(event.target.value)}
              aria-describedby="absentSessions-hint"
            />
            <p id="absentSessions-hint" className="mt-1 text-xs text-muted">
              {classSectionId
                ? absenceSourceHint(systemAbsences[classSectionId], absentInput)
                : 'Chọn lớp học phần để lấy số buổi vắng từ dữ liệu điểm danh.'}{' '}
              Vắng 2 buổi +2 điểm, từ 3 buổi +3 điểm rủi ro.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BandGroup
          name="academicBand"
          legend="Khả năng học tập"
          descriptions={ACADEMIC_BAND_DESCRIPTIONS}
          value={academicBand}
          onChange={setAcademicBand}
        />
        <BandGroup
          name="attitudeBand"
          legend="Thái độ học tập"
          descriptions={ATTITUDE_BAND_DESCRIPTIONS}
          value={attitudeBand}
          onChange={setAttitudeBand}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CriteriaGroup
          legend="Vấn đề cá nhân của sinh viên"
          hint="Tích ô nào thì điểm rủi ro cộng thêm bấy nhiêu."
          criteria={PERSONAL_CRITERIA}
          selected={criteria}
          onToggle={toggleCriterion}
        />
        <CriteriaGroup
          legend="Vấn đề học tập / hành vi"
          hint="Ghi nhận từ lớp học phần bạn đang dạy."
          criteria={ACADEMIC_CRITERIA}
          selected={criteria}
          onToggle={toggleCriterion}
        />
      </div>

      <EvaluationGuidancePanel scores={guidanceScores} showHandoffHint />

      <div>
        <Label htmlFor="note">Nhận xét</Label>
        <Textarea
          key={`note-${classSectionId}-${existing?.id ?? 'moi'}`}
          id="note"
          name="note"
          placeholder="Mô tả tình huống cụ thể…"
          defaultValue={existing?.note ?? ''}
        />
        <p className="mt-1 text-xs text-muted">
          Nội dung này được gửi tới AI để tổng hợp —{' '}
          <strong>không ghi số điện thoại, email hay địa chỉ</strong> của sinh viên.
        </p>
      </div>

      <RaiseAlertToggle checked={raiseAlert} level={suggestedLevel} onChange={setRaiseAlert} />

      <div className="flex justify-end gap-3">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" disabled={saveMutation.isPending || sections.length === 0}>
          {saveMutation.isPending
            ? raiseAlert
              ? 'Đang lưu & phát cảnh báo…'
              : 'Đang lưu…'
            : `${existing ? 'Cập nhật nhận xét' : 'Lưu nhận xét'}${
                raiseAlert ? ` & phát cảnh báo Mức ${suggestedLevel}` : ''
              }`}
        </Button>
      </div>
    </form>
  );
}
