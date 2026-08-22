import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class UploadImportDto {
  @ApiProperty({
    description:
      'Học kỳ áp dụng, vd "SU26". Bắt buộc — file nguồn không chứa học kỳ đáng tin cậy.',
    example: 'SU26',
  })
  @IsString()
  @Matches(/^[A-Z]{2}\d{2}$/, {
    message: 'Học kỳ phải có dạng 2 chữ cái + 2 chữ số, vd "SU26".',
  })
  term!: string;
}
