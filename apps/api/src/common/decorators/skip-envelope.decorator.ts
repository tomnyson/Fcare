import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';

/** Bỏ qua envelope { success, data, error } — dùng cho SSE stream. */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
