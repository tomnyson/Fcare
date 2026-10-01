import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PIN_LENGTH,
  PIN_PROOF_PURPOSES,
  type PinProofPurpose,
} from '@fcare/shared-types';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class SetPinDto {
  @ApiProperty({
    description: 'Mã PIN mới — 6 chữ số, không lặp/dãy liên tiếp',
  })
  @IsString()
  @Length(PIN_LENGTH, PIN_LENGTH, {
    message: `Mã PIN phải gồm đúng ${PIN_LENGTH} chữ số.`,
  })
  pin!: string;

  @ApiPropertyOptional({ description: 'PIN hiện tại — bắt buộc khi đổi PIN' })
  @IsOptional()
  @IsString()
  @Length(PIN_LENGTH, PIN_LENGTH, {
    message: `Mã PIN phải gồm đúng ${PIN_LENGTH} chữ số.`,
  })
  currentPin?: string;
}

export class VerifyPinDto {
  @ApiProperty({ description: 'Mã PIN 6 số' })
  @IsString()
  @Length(PIN_LENGTH, PIN_LENGTH, {
    message: `Mã PIN phải gồm đúng ${PIN_LENGTH} chữ số.`,
  })
  pin!: string;

  @ApiPropertyOptional({
    enum: PIN_PROOF_PURPOSES,
    description:
      'Có mục đích → trả `proof` dùng cho header X-Pin-Proof (2 phút)',
  })
  @IsOptional()
  @IsIn(PIN_PROOF_PURPOSES)
  purpose?: PinProofPurpose;
}
