import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SystemErrorLevel, SystemErrorSource } from '@prisma/client';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = () =>
  Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  );

/** Cùng quy tắc với `isDiscordWebhookUrl` — kiểm tra lại lần nữa ở service. */
const DISCORD_WEBHOOK_PATTERN =
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\/?$/;
const WEBHOOK_MESSAGE =
  'URL webhook phải có dạng https://discord.com/api/webhooks/<id>/<token>';
const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateMonitoringSettingsDto {
  @ApiPropertyOptional({ description: 'Bỏ trống = giữ webhook cũ' })
  @IsOptional()
  @trim()
  @IsString({ message: WEBHOOK_MESSAGE })
  @MaxLength(512, { message: 'URL webhook tối đa 512 ký tự' })
  @Matches(DISCORD_WEBHOOK_PATTERN, { message: WEBHOOK_MESSAGE })
  webhookUrl?: string;

  @ApiPropertyOptional({ description: 'true = xoá webhook đã lưu' })
  @IsOptional()
  @IsBoolean({ message: 'Trường xoá webhook phải là true/false' })
  clearWebhook?: boolean;

  @ApiProperty()
  @IsBoolean({ message: 'Trường bật báo cáo phải là true/false' })
  enabled!: boolean;

  @ApiProperty({ minimum: 7, maximum: 365, example: 30 })
  @Type(() => Number)
  @IsInt({ message: 'Số ngày lưu phải là số nguyên' })
  @Min(7, { message: 'Số ngày lưu phải từ 7 đến 365' })
  @Max(365, { message: 'Số ngày lưu phải từ 7 đến 365' })
  retentionDays!: number;
}

export class TestWebhookDto {
  @ApiPropertyOptional({
    description: 'Webhook đang nhập trên form (chưa lưu)',
  })
  @IsOptional()
  @trim()
  @IsString({ message: WEBHOOK_MESSAGE })
  @MaxLength(512, { message: 'URL webhook tối đa 512 ký tự' })
  @Matches(DISCORD_WEBHOOK_PATTERN, { message: WEBHOOK_MESSAGE })
  webhookUrl?: string;
}

export class SendReportDto {
  @ApiPropertyOptional({
    example: '2026-09-14',
    description: 'Ngày bất kỳ trong tuần cần báo cáo; bỏ trống = tuần này',
  })
  @IsOptional()
  @Matches(WEEK_PATTERN, { message: 'Tuần phải có dạng YYYY-MM-DD' })
  week?: string;
}

export class ListErrorGroupsQuery {
  @ApiPropertyOptional({ example: '2026-09-14' })
  @IsOptional()
  @Matches(WEEK_PATTERN, { message: 'Tuần phải có dạng YYYY-MM-DD' })
  week?: string;

  @ApiPropertyOptional({ enum: SystemErrorLevel })
  @IsOptional()
  @IsEnum(SystemErrorLevel, { message: 'Mức lỗi không hợp lệ' })
  level?: SystemErrorLevel;

  @ApiPropertyOptional({ enum: SystemErrorSource })
  @IsOptional()
  @IsEnum(SystemErrorSource, { message: 'Nguồn lỗi không hợp lệ' })
  source?: SystemErrorSource;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Trang phải là số nguyên' })
  @Min(1, { message: 'Trang phải từ 1 trở lên' })
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt({ message: 'Số dòng phải là số nguyên' })
  @Min(1, { message: 'Số dòng phải từ 1 đến 100' })
  @Max(100, { message: 'Số dòng phải từ 1 đến 100' })
  limit: number = 20;
}
