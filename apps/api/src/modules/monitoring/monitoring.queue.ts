export const MONITORING_QUEUE = 'monitoring';
export const WEEKLY_REPORT_JOB = 'weekly-error-report';
export const PURGE_ERRORS_JOB = 'purge-error-groups';

export const MONITORING_TIMEZONE = 'Asia/Ho_Chi_Minh';
/** Thứ Hai 08:00 — báo cáo tuần trước. */
export const WEEKLY_REPORT_CRON = '0 8 * * 1';
/** 03:00 hằng ngày — giờ vắng người dùng. */
export const PURGE_CRON = '0 3 * * *';
