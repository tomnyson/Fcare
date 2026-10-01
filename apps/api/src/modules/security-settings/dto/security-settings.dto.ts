import { ApiProperty } from '@nestjs/swagger';
import { IDLE_LOCK_MINUTES_OPTIONS } from '@fcare/shared-types';
import { IsIn } from 'class-validator';

export class UpdateSecuritySettingsDto {
  @ApiProperty({ enum: IDLE_LOCK_MINUTES_OPTIONS, example: 15 })
  @IsIn(IDLE_LOCK_MINUTES_OPTIONS, {
    message: 'Thời gian khoá chỉ được chọn 3, 5, 10, 15, 30 hoặc 60 phút',
  })
  idleLockMinutes!: number;
}
