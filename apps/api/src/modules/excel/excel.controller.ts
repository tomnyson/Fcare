import {
  BadRequestException,
  Controller,
  Get,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { GradesExcelService } from './grades-excel.service';
import { StudentsExcelService } from './students-excel.service';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const uploadOptions = { limits: { fileSize: MAX_FILE_SIZE } };

function requireXlsx(file: Express.Multer.File | undefined): Buffer {
  if (!file) {
    throw new BadRequestException('Thiếu file Excel (field "file").');
  }
  if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new BadRequestException('Chỉ chấp nhận file .xlsx.');
  }
  return file.buffer;
}

/**
 * Import/Export Excel — theo Quy định chung, chỉ Trưởng bộ môn, Cán bộ Đào tạo
 * và CTSV (cùng ADMIN) được dùng nhóm API này. Mọi thao tác đều ghi audit log.
 */
@ApiTags('excel')
@Controller('excel')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class ExcelController {
  constructor(
    private readonly studentsExcelService: StudentsExcelService,
    private readonly gradesExcelService: GradesExcelService,
  ) {}

  @Post('students/import')
  @CheckPolicies((ability: AppAbility) => ability.can('import', 'Excel'))
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  importStudents(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.studentsExcelService.import(user, requireXlsx(file));
  }

  @Get('students/export')
  @CheckPolicies((ability: AppAbility) => ability.can('export', 'Excel'))
  exportStudents(
    @CurrentUser() user: AuthUser,
    @Query('departmentId') departmentId?: string,
    @Query('classCode') classCode?: string,
  ) {
    return this.studentsExcelService.export(user, {
      departmentId: departmentId || undefined,
      classCode: classCode || undefined,
    });
  }

  @Post('grades/import')
  @CheckPolicies((ability: AppAbility) => ability.can('import', 'Excel'))
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  importGrades(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.gradesExcelService.import(user, requireXlsx(file));
  }

  @Get('grades/export')
  @CheckPolicies((ability: AppAbility) => ability.can('export', 'Excel'))
  exportGrades(
    @CurrentUser() user: AuthUser,
    @Query('classSectionId', ParseUUIDPipe) classSectionId: string,
  ) {
    return this.gradesExcelService.export(user, classSectionId);
  }
}
