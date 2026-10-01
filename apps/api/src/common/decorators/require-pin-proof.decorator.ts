import { SetMetadata } from '@nestjs/common';
import type { PinProofPurpose } from '@fcare/shared-types';

export const PIN_PROOF_PURPOSE_KEY = 'pinProofPurpose';

/**
 * Thao tác phá huỷ: client phải gọi `POST /auth/pin/verify` kèm `purpose`
 * rồi gửi lại `X-Pin-Proof` (sống 2 phút) — PIN được kiểm ở server, không ở trình duyệt.
 */
export const RequirePinProof = (purpose: PinProofPurpose) =>
  SetMetadata(PIN_PROOF_PURPOSE_KEY, purpose);
