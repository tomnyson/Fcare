import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class StaffEmailMappingDto {
  @ApiProperty({ description: 'Mã nhân viên' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  staffCode!: string;

  @ApiProperty({ description: 'Email FPT (@fpt.edu.vn / @fe.edu.vn)' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}

export class BulkStaffEmailDto {
  @ApiProperty({
    type: [StaffEmailMappingDto],
    description: 'Danh sách mapping mã nhân viên và email',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffEmailMappingDto)
  mappings!: StaffEmailMappingDto[];

  @ApiProperty({
    required: false,
    description:
      'Cho phép ghi đè email nếu nhân viên đã có email trước đó (mặc định: true)',
    default: true,
  })
  @Transform(
    ({ value }) =>
      value === true || value === 'true' || value === 1 || value === '1',
  )
  overrideExisting?: boolean = true;
}
