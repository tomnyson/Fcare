'use client';

import { Badge, Button } from '@fcare/ui-kit';
import { useState } from 'react';
import { apiDownload, apiFetch, ApiError } from '../../lib/api';
import type { AddStudentsResult, ClassSection } from '../../lib/types';
import { FormError, FormSuccess, Textarea } from '../ui/form';
import { Modal } from '../ui/modal';
import { parseStudentInputText, type ParsedStudentRow } from './student-input-parser';

export interface AddStudentsModalProps {
  section: ClassSection | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (result: AddStudentsResult) => void;
}

export function AddStudentsModal({
  section,
  open,
  onClose,
  onSuccess,
}: AddStudentsModalProps) {
  const [tab, setTab] = useState<'direct' | 'excel'>('direct');
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([]);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!open || !section) {
    return null;
  }

  const handleTextChange = (text: string) => {
    setInputText(text);
    setError('');
    const rows = parseStudentInputText(text);
    setParsedRows(rows);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setError('');
  };

  const handleRemoveRow = (index: number) => {
    const next = [...parsedRows];
    next.splice(index, 1);
    setParsedRows(next);
  };

  const validStudents = parsedRows.filter((r) => r.isValid);

  const handleDownloadTemplate = async () => {
    setIsDownloading(true);
    try {
      await apiDownload(
        '/class-sections/template/students',
        'mau-bo-sung-sinh-vien.xlsx',
      );
    } catch {
      setError('Không thể tải file mẫu Excel.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    setSuccessMessage('');

    if (tab === 'direct') {
      if (validStudents.length === 0) {
        setError('Vui lòng nhập ít nhất một sinh viên hợp lệ (gồm MSSV và Họ tên).');
        return;
      }

      setIsSubmitting(true);
      try {
        const payload = {
          students: validStudents.map((s) => ({
            studentCode: s.studentCode,
            fullName: s.fullName,
          })),
        };

        const result = await apiFetch<AddStudentsResult>(
          `/class-sections/${section.id}/students`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );

        setSuccessMessage(
          `Bổ sung thành công: ${result.addedCount} sinh viên mới vào lớp! (${result.existingCount} sinh viên đã có sẵn).`,
        );
        onSuccess(result);
        setTimeout(() => {
          onClose();
          setInputText('');
          setParsedRows([]);
        }, 1200);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không thể bổ sung sinh viên vào lớp.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      if (!selectedFile) {
        setError('Vui lòng chọn file Excel (.xlsx).');
        return;
      }

      setIsSubmitting(true);
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const result = await apiFetch<AddStudentsResult>(
          `/class-sections/${section.id}/students/upload`,
          {
            method: 'POST',
            body: formData,
          },
        );

        setSuccessMessage(
          `Bổ sung thành công: ${result.addedCount} sinh viên từ file Excel! (${result.existingCount} sinh viên đã có sẵn).`,
        );
        onSuccess(result);
        setTimeout(() => {
          onClose();
          setSelectedFile(null);
        }, 1200);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không thể tải file lên máy chủ.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bổ sung sinh viên vào lớp học phần"
      size="lg"
      scrollBody
    >
      <div className="space-y-4">
        {/* Thông tin lớp học phần */}
        <div className="rounded-lg border border-border bg-slate-50 p-3.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-ink">Mã lớp: </span>
              <span className="font-mono font-bold text-fpt-orange">{section.code}</span>
            </div>
            <div>
              <span className="text-muted">Học kỳ: </span>
              <span className="font-semibold text-ink">{section.term}</span>
            </div>
          </div>
          {section.subject && (
            <div className="mt-1 text-muted">
              Môn học: <span className="font-medium text-ink">{section.subject.name} ({section.subject.code})</span>
            </div>
          )}
        </div>

        {/* Tab chuyển đổi cách thức nhập */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setTab('direct')}
            className={`border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === 'direct'
                ? 'border-fpt-orange text-fpt-orange'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Nhập trực tiếp / Dán từ Excel
          </button>
          <button
            type="button"
            onClick={() => setTab('excel')}
            className={`border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === 'excel'
                ? 'border-fpt-orange text-fpt-orange'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Tải file Excel (.xlsx)
          </button>
        </div>

        {error && <FormError>{error}</FormError>}
        {successMessage && <FormSuccess>{successMessage}</FormSuccess>}

        {tab === 'direct' ? (
          <div className="space-y-3">
            <div className="text-xs text-muted">
              Nhập hoặc dán danh sách sinh viên. Mỗi dòng gồm: <strong className="text-ink">MSSV</strong> và <strong className="text-ink">Họ tên</strong> (cách nhau bởi phím Tab, dấu phẩy hoặc khoảng trắng). Các thông tin khác sẽ dùng giá trị mặc định.
            </div>

            <Textarea
              rows={5}
              value={inputText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={'PK04346\tHoàng Lê Minh Sang\nPK04347\tNguyễn Văn Nam'}
              className="font-mono text-sm"
            />

            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink">
                    Danh sách đã nhận diện ({validStudents.length}/{parsedRows.length} hợp lệ)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTextChange('')}
                    className="text-muted hover:text-danger underline"
                  >
                    Xóa tất cả
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-muted">
                      <tr>
                        <th className="px-3 py-2 font-semibold">STT</th>
                        <th className="px-3 py-2 font-semibold">MSSV</th>
                        <th className="px-3 py-2 font-semibold">Họ và tên</th>
                        <th className="px-3 py-2 font-semibold">Trạng thái</th>
                        <th className="px-3 py-2 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {parsedRows.map((row, idx) => (
                        <tr key={idx} className={row.isValid ? 'hover:bg-slate-50' : 'bg-danger/5'}>
                          <td className="px-3 py-1.5 tabular-nums text-muted">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-mono font-semibold">{row.studentCode}</td>
                          <td className="px-3 py-1.5">{row.fullName || '—'}</td>
                          <td className="px-3 py-1.5">
                            {row.isValid ? (
                              <Badge tone="success">Hợp lệ</Badge>
                            ) : (
                              <span className="text-danger">{row.error}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(idx)}
                              className="text-muted hover:text-danger"
                              title="Xóa dòng"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
              <input
                type="file"
                id="excel-file-input"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="excel-file-input"
                className="cursor-pointer inline-flex flex-col items-center justify-center space-y-2"
              >
                <div className="rounded-full bg-fpt-blue/10 p-3 text-fpt-blue text-xl">
                  📄
                </div>
                <span className="text-sm font-semibold text-ink">
                  {selectedFile ? selectedFile.name : 'Bấm để chọn file Excel hoặc kéo thả vào đây'}
                </span>
                <span className="text-xs text-muted">Chấp nhận file định dạng .xlsx</span>
              </label>
            </div>

            <div className="flex items-center justify-between rounded-md bg-slate-50 p-3 text-xs text-muted">
              <span>Định dạng file yêu cầu: 2 cột <strong>MSSV</strong> và <strong>Họ tên</strong>.</span>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={isDownloading}
                className="font-semibold text-fpt-blue hover:underline cursor-pointer"
              >
                {isDownloading ? 'Đang tải…' : '⬇ Tải file mẫu (.xlsx)'}
              </button>
            </div>
          </div>
        )}

        {/* Nút hành động footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              (tab === 'direct' && validStudents.length === 0) ||
              (tab === 'excel' && !selectedFile)
            }
          >
            {isSubmitting
              ? 'Đang bổ sung…'
              : tab === 'direct'
                ? `Xác nhận bổ sung (${validStudents.length} SV)`
                : 'Tải file và bổ sung'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
