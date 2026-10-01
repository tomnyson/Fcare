export interface OpenAlertRef {
  id: string;
  studentId: string;
  createdAt: Date;
}

export interface MyCareLogRef {
  studentId: string;
  alertId: string | null;
  createdAt: Date;
}

/**
 * Số cảnh báo đang mở mà NGƯỜI XEM chưa chăm sóc — badge "Cảnh báo" ở menu.
 * "Đã chăm sóc" = có nhật ký gắn đúng cảnh báo, hoặc nhật ký về sinh viên đó
 * ghi từ lúc cảnh báo phát trở đi. Mỗi giảng viên có số riêng: người này ghi
 * nhật ký thì chỉ badge của họ giảm, người khác vẫn thấy cho tới khi tự chăm sóc.
 */
export function countAlertsAwaitingMyCare(
  alerts: readonly OpenAlertRef[],
  myLogs: readonly MyCareLogRef[],
): number {
  const caredAlertIds = new Set(
    myLogs.flatMap((log) => (log.alertId ? [log.alertId] : [])),
  );
  const latestLogByStudent = new Map<string, number>();
  for (const log of myLogs) {
    const time = log.createdAt.getTime();
    if (time > (latestLogByStudent.get(log.studentId) ?? -Infinity)) {
      latestLogByStudent.set(log.studentId, time);
    }
  }
  return alerts.filter((alert) => {
    if (caredAlertIds.has(alert.id)) return false;
    const latest = latestLogByStudent.get(alert.studentId);
    return latest === undefined || latest < alert.createdAt.getTime();
  }).length;
}
