import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ImportKind } from '@prisma/client';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import {
  ListImportRowsQuery,
  ListImportsQuery,
  UploadImportDto,
} from './dto/import.dto';
import { ImportsService } from './imports.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB — file phân công GV có 449 dòng danh mục.

const KIND_BY_SLUG: Record<string, ImportKind> = {
  catalog: ImportKind.CATALOG,
  lecturer: ImportKind.LECTURER,
  schedule: ImportKind.SCHEDULE,
  gradebook: ImportKind.GRADEBOOK,
  'section-list': ImportKind.SECTION_LIST,
  roster: ImportKind.ROSTER,
  'grade-attendance': ImportKind.GRADE_ATTENDANCE,
};

function requireXlsx(file: Express.Multer.File | undefined): Buffer {
  if (!file) {
    throw new BadRequestException('Thiếu file Excel (field "file").');
  }
  if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new BadRequestException('Chỉ chấp nhận file .xlsx.');
  }
  return file.buffer;
}

function requireKind(slug: string): ImportKind {
  const kind = KIND_BY_SLUG[slug];
  if (!kind) {
    throw new BadRequestException(
      `Loại import không hợp lệ. Chọn một trong: ${Object.keys(KIND_BY_SLUG).join(', ')}.`,
    );
  }
  return kind;
}

/**
 * Import nghiệp vụ theo luồng staging: upload → xem trước → commit.
 * Cùng quyền với module excel: LECTURER KHÔNG BAO GIỜ vào được (RULE 3).
 */
@ApiTags('imports')
@Controller('imports')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can('import', 'Excel'))
  list(@CurrentUser() user: AuthUser, @Query() query: ListImportsQuery) {
    return this.importsService.list(user, query);
  }

  @Post(':kind/upload')
  @CheckPolicies((ability: AppAbility) => ability.can('import', 'Excel'))
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'term'],
      properties: {
        file: { type: 'string', format: 'binary' },
        term: { type: 'string', example: 'SU26' },
      },
    },
  })
  upload(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Body() dto: UploadImportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.importsService.upload(
      user,
      requireKind(kind),
      requireXlsx(file),
      file!.originalname,
      dto.term,
    );
  }

  @Get(':batchId/preview')
  @CheckPolicies((ability: AppAbility) => ability.can('import', 'Excel'))
  preview(
    @CurrentUser() user: AuthUser,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Query() query: ListImportRowsQuery,
  ) {
    return this.importsService.preview(user, batchId, query);
  }

  @Post(':batchId/commit')
  @CheckPolicies((ability: AppAbility) => ability.can('import', 'Excel'))
  commit(
    @CurrentUser() user: AuthUser,
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ) {
    return this.importsService.commit(user, batchId);
  }

  @Delete(':batchId')
  @CheckPolicies((ability: AppAbility) => ability.can('import', 'Excel'))
  discard(
    @CurrentUser() user: AuthUser,
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ) {
    return this.importsService.discard(user, batchId);
  }
}
