import { SetMetadata } from '@nestjs/common';
import type { AppAbility } from '../../casl/ability.factory';

export type PolicyHandler = (ability: AppAbility) => boolean;

export const CHECK_POLICIES_KEY = 'checkPolicies';

/** Khai báo điều kiện CASL cần thỏa để truy cập route. */
export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
