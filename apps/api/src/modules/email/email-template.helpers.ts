export interface BaseEmailStudent {
  fullName: string;
  studentCode: string;
  classCode?: string | null;
}

export interface AlertEmailData {
  student: BaseEmailStudent;
  level: number;
  reason: string;
  raisedByName: string;
  actionUrl: string;
}

export interface CareLogEmailData {
  student: BaseEmailStudent;
  channel?: string | null;
  content: string;
  outcome?: string | null;
  nextAction?: string | null;
  staffName: string;
  actionUrl: string;
}

export interface DiscussionEmailData {
  student: BaseEmailStudent;
  authorName: string;
  messagePreview: string;
  actionUrl: string;
}

const LEVEL_LABELS: Record<
  number,
  { title: string; color: string; bg: string }
> = {
  2: { title: 'Cảnh báo Trung bình', color: '#FFFFFF', bg: '#D97706' },
  3: { title: 'Cảnh báo Cao', color: '#FFFFFF', bg: '#EA580C' },
  4: { title: 'Cảnh báo Khẩn cấp', color: '#FFFFFF', bg: '#DC2626' },
};

function renderLayout(
  title: string,
  contentHtml: string,
  actionUrl: string,
  actionText = 'Xem chi tiết trên FCare',
): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1); border: 1px solid #E2E8F0;">
          <!-- Header -->
          <tr>
            <td style="background-color: #16304E; padding: 20px 24px; text-align: left;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="color: #F37021; font-weight: bold; font-size: 20px; letter-spacing: 0.5px;">FCare</div>
                    <div style="color: #E2E8F0; font-size: 13px; margin-top: 2px;">Hệ thống Chăm sóc & Giám sát Học vụ</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 24px;">
              ${contentHtml}
              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 24px;">
                <tr>
                  <td align="center">
                    <a href="${actionUrl}" target="_blank" style="display: inline-block; background-color: #F37021; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                      ${actionText}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #F1F5F9; padding: 16px 24px; text-align: center; border-top: 1px solid #E2E8F0;">
              <p style="margin: 0; font-size: 12px; color: #64748B; line-height: 1.5;">
                Email tự động từ hệ thống FCare. Vui lòng bảo mật thông tin học vụ sinh viên theo quy định của nhà trường.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderStudentBox(student: BaseEmailStudent): string {
  return `
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 14px 16px; margin-bottom: 20px;">
      <div style="font-size: 13px; color: #64748B; margin-bottom: 4px;">Thông tin sinh viên:</div>
      <div style="font-size: 16px; font-weight: 700; color: #0F172A;">
        ${student.fullName} <span style="color: #64748B; font-weight: 500;">(${student.studentCode})</span>
      </div>
      ${student.classCode ? `<div style="font-size: 13px; color: #475569; margin-top: 4px;">Lớp: <strong>${student.classCode}</strong></div>` : ''}
    </div>
  `;
}

export function renderAlertEmail(data: AlertEmailData) {
  const levelInfo = LEVEL_LABELS[data.level] ?? {
    title: `Cảnh báo Mức ${data.level}`,
    color: '#FFF',
    bg: '#EA580C',
  };
  const subject = `[FCare - ${levelInfo.title}] ${data.student.fullName} (${data.student.studentCode})`;

  const contentHtml = `
    ${renderStudentBox(data.student)}
    <div style="margin-bottom: 16px;">
      <span style="display: inline-block; background-color: ${levelInfo.bg}; color: ${levelInfo.color}; font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 4px; text-transform: uppercase;">
        ${levelInfo.title}
      </span>
    </div>
    <div style="background-color: #FFFBEB; border-left: 4px solid ${levelInfo.bg}; padding: 12px 16px; margin-bottom: 16px; border-radius: 0 4px 4px 0;">
      <div style="font-size: 13px; font-weight: 600; color: #92400E; margin-bottom: 4px;">Lý do cảnh báo:</div>
      <div style="font-size: 14px; color: #1E293B; line-height: 1.5;">${data.reason}</div>
    </div>
    <div style="font-size: 13px; color: #64748B;">
      Người phát cảnh báo: <strong>${data.raisedByName}</strong>
    </div>
  `;

  return {
    subject,
    html: renderLayout(subject, contentHtml, data.actionUrl),
    text: `${subject}\n\nSinh viên: ${data.student.fullName} (${data.student.studentCode})\nLý do: ${data.reason}\nNgười phát: ${data.raisedByName}\nChi tiết: ${data.actionUrl}`,
  };
}

export function renderCareLogEmail(data: CareLogEmailData) {
  const subject = `[FCare - Nhật ký chăm sóc] ${data.student.fullName} (${data.student.studentCode})`;
  const channelLabel =
    data.channel === 'IN_PERSON'
      ? 'Gặp trực tiếp'
      : data.channel === 'ONLINE'
        ? 'Trao đổi trực tuyến'
        : data.channel;

  const contentHtml = `
    ${renderStudentBox(data.student)}
    <div style="background-color: #F0FDF4; border-left: 4px solid #16A34A; padding: 12px 16px; margin-bottom: 16px; border-radius: 0 4px 4px 0;">
      ${channelLabel ? `<div style="font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 4px;">Hình thức: ${channelLabel}</div>` : ''}
      <div style="font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 4px;">Nội dung tiếp xúc:</div>
      <div style="font-size: 14px; color: #1E293B; line-height: 1.5; margin-bottom: 8px;">${data.content}</div>
      ${
        data.outcome
          ? `
        <div style="font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 4px;">Kết quả đạt được:</div>
        <div style="font-size: 14px; color: #1E293B; line-height: 1.5; margin-bottom: 8px;">${data.outcome}</div>
      `
          : ''
      }
      ${
        data.nextAction
          ? `
        <div style="font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 4px;">Kế hoạch / Hành động tiếp theo:</div>
        <div style="font-size: 14px; color: #1E293B; line-height: 1.5;">${data.nextAction}</div>
      `
          : ''
      }
    </div>
    <div style="font-size: 13px; color: #64748B;">
      Cán bộ ghi nhận: <strong>${data.staffName}</strong>
    </div>
  `;

  return {
    subject,
    html: renderLayout(subject, contentHtml, data.actionUrl),
    text: `${subject}\n\nSinh viên: ${data.student.fullName} (${data.student.studentCode})\nNội dung: ${data.content}\nKết quả: ${data.outcome || 'N/A'}\nKế hoạch: ${data.nextAction || 'N/A'}\nCán bộ: ${data.staffName}\nChi tiết: ${data.actionUrl}`,
  };
}

export function renderDiscussionEmail(data: DiscussionEmailData) {
  const subject = `[FCare - Trao đổi mới] Về sinh viên ${data.student.fullName} (${data.student.studentCode})`;

  const contentHtml = `
    ${renderStudentBox(data.student)}
    <div style="background-color: #F8FAFC; border-left: 4px solid #0284C7; padding: 12px 16px; margin-bottom: 16px; border-radius: 0 4px 4px 0;">
      <div style="font-size: 13px; font-weight: 600; color: #0369A1; margin-bottom: 4px;">${data.authorName} đã gửi tin nhắn:</div>
      <div style="font-size: 14px; color: #1E293B; line-height: 1.5;">${data.messagePreview}</div>
    </div>
    <div style="font-size: 13px; color: #64748B;">
      Hãy truy cập tab Trao đổi trên hồ sơ sinh viên để phản hồi.
    </div>
  `;

  return {
    subject,
    html: renderLayout(
      subject,
      contentHtml,
      data.actionUrl,
      'Xem trao đổi trên FCare',
    ),
    text: `${subject}\n\n${data.authorName}: ${data.messagePreview}\nChi tiết: ${data.actionUrl}`,
  };
}
