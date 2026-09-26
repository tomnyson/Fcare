/**
 * Kết quả `POST /alerts` sau khi gộp cảnh báo (docs/plan-lert.md mục 1): API có
 * thể tạo mới, nâng mức cảnh báo đang mở, hoặc chỉ gộp lý do — người phát cần
 * biết chuyện gì đã xảy ra thay vì luôn thấy "Đã phát cảnh báo".
 */
export type RaiseDecision = 'created' | 'escalated' | 'merged';

export interface RaiseAlertResult {
  level: number;
  decision?: RaiseDecision;
  requestedLevel?: number;
  systemLevel?: number;
  previousLevel?: number | null;
  notifiedCount?: number;
}

export interface RaiseMessage {
  tone: 'success' | 'warning' | 'info';
  text: string;
}

function recipients(count: number | undefined): string {
  return count && count > 0 ? `${count} người` : '';
}

export function describeRaiseResult(result: RaiseAlertResult): RaiseMessage {
  const who = recipients(result.notifiedCount);

  if (result.decision === 'merged') {
    return {
      tone: 'info',
      text: `Sinh viên đã có cảnh báo Mức ${result.level} đang mở — đã bổ sung lý do vào cảnh báo đó, không gửi thông báo mới.`,
    };
  }

  if (result.decision === 'escalated') {
    return {
      tone: 'warning',
      text: `Sinh viên đã có cảnh báo đang mở — đã nâng từ Mức ${result.previousLevel} lên Mức ${result.level}${
        who ? ` và báo lại ${who}` : ''
      }.`,
    };
  }

  const requested = result.requestedLevel ?? result.level;
  if (requested < result.level) {
    return {
      tone: 'warning',
      text: `Đã phát cảnh báo Mức ${result.level} — hệ thống tự nâng từ Mức ${requested} theo điểm rủi ro học kỳ.${
        who ? ` Thông báo tới ${who}.` : ''
      }`,
    };
  }

  return {
    tone: 'success',
    text: `Đã phát cảnh báo Mức ${result.level}${who ? `, thông báo tới ${who}` : ''}.`,
  };
}

/** Mức thấp nhất được chọn khi phát — API cũng tự nâng lên mức này. */
export function minRaiseLevel(
  riskScore: { drsLevel: number; dataForcedLevel: number } | undefined,
): number {
  return riskScore ? Math.max(1, riskScore.drsLevel, riskScore.dataForcedLevel) : 1;
}
