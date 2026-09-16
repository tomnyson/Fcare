import {
  BadRequestException,
  Body,
  Controller,
  Get,
  UploadedFile,
  UseInterceptors,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { loadFirstWorksheet } from '../excel/excel-utils';
import { Throttle } from '@nestjs/throttler';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { AdminService } from './admin.service';
import {
  BulkAssignDepartmentDto,
  CreateStaffDto,
  ListStaffQuery,
  UpdateStaffDto,
} from './dto/staff.dto';
import { BulkStaffEmailDto } from './dto/staff-email.dto';

@ApiTags('admin')
@Controller('admin/staff')
@CheckPolicies((ability: AppAbility) => ability.can('update', 'Staff'))
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  list(@Query() query: ListStaffQuery) {
    return this.adminService.list(query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.adminService.create(user.id, dto);
  }

  @Post('bulk-email')
  bulkAssignEmails(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkStaffEmailDto,
  ) {
    return this.adminService.bulkAssignEmails(user.id, dto);
  }

  @Get('email-template.xlsx')
  async downloadEmailTemplate(): Promise<StreamableFile> {
    const buffer = await this.adminService.getEmailTemplateBuffer();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="mau_mapping_email_nhan_vien.xlsx"',
    });
  }

  @Get('export-emails.xlsx')
  async exportStaffEmails(): Promise<StreamableFile> {
    const buffer = await this.adminService.exportEmailsBuffer();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition:
        'attachment; filename="fcare_danh_sach_email_nhan_vien.xlsx"',
    });
  }

  @Post('bulk-email-file')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  async bulkEmailFile(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
    @Body('overrideExisting') overrideExistingRaw?: string,
  ) {
    if (!file) throw new BadRequestException('Thiếu file mapping email.');
    const fileName = file.originalname.toLowerCase();
    const isXlsx = fileName.endsWith('.xlsx');
    const isCsv = fileName.endsWith('.csv');

    if (!isXlsx && !isCsv) {
      throw new BadRequestException(
        'File upload hỗ trợ định dạng .xlsx hoặc .csv.',
      );
    }

    const rows: Array<{ staffCode: string; email: string }> = [];

    if (isCsv) {
      const text = file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));

      if (lines.length === 0) {
        throw new BadRequestException('File CSV rỗng.');
      }

      const firstLine = lines[0];
      const delimiter = firstLine.includes('\t')
        ? '\t'
        : firstLine.includes(';')
          ? ';'
          : ',';
      const headers = firstLine.split(delimiter).map((h) =>
        h
          .replace(/^["']+|["']+$/g, '')
          .trim()
          .toLowerCase(),
      );

      let codeCol = headers.findIndex((h) =>
        /^(manv|ma_nv|mã nv|mã nhân viên|staffcode|username|id)$/i.test(h),
      );
      let emailCol = headers.findIndex((h) =>
        /^(email|mail|thư điện tử|email công vụ)$/i.test(h),
      );
      let startIndex = 1;

      if (codeCol === -1 || emailCol === -1) {
        if (firstLine.includes('@')) {
          startIndex = 0;
          codeCol = 0;
          emailCol = 1;
        } else {
          codeCol = 0;
          emailCol = 1;
        }
      }

      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i]
          .split(delimiter)
          .map((p) => p.replace(/^["']+|["']+$/g, '').trim());
        const staffCode = parts[codeCol] ?? '';
        const email = (parts[emailCol] ?? '').toLowerCase().replace(/\s+/g, '');
        if (staffCode && email && email.includes('@')) {
          rows.push({ staffCode, email });
        }
      }
    } else {
      const sheet = await loadFirstWorksheet(file.buffer);
      let codeCol = 1;
      let emailCol = 2;
      let startRow = 2;

      // Tìm header trong 10 dòng đầu
      let foundHeader = false;
      for (let r = 1; r <= Math.min(sheet.rowCount, 10); r++) {
        const row = sheet.getRow(r);
        let hasCode = false;
        let hasMail = false;
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const text = cell.text.trim().toLowerCase();
          if (
            /^(manv|ma_nv|mã nv|mã nhân viên|staffcode|username|id)$/i.test(
              text,
            )
          ) {
            codeCol = colNumber;
            hasCode = true;
          } else if (/^(email|mail|thư điện tử|email công vụ)$/i.test(text)) {
            emailCol = colNumber;
            hasMail = true;
          }
        });
        if (hasCode || hasMail) {
          foundHeader = true;
          startRow = r + 1;
          break;
        }
      }

      if (!foundHeader) {
        const cell2Text = sheet.getRow(1).getCell(2).text.trim();
        if (cell2Text.includes('@')) {
          startRow = 1;
        }
      }

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber < startRow) return;

        const cellCode = row.getCell(codeCol);
        const cellEmail = row.getCell(emailCol);

        let staffCode = '';
        const codeVal = cellCode.value;
        if (codeVal && typeof codeVal === 'object') {
          if (
            'text' in codeVal &&
            typeof (codeVal as { text: unknown }).text === 'string'
          ) {
            staffCode = String((codeVal as { text: string }).text).trim();
          } else if ('richText' in codeVal && Array.isArray(codeVal.richText)) {
            staffCode = codeVal.richText
              .map((t) => t.text)
              .join('')
              .trim();
          } else {
            staffCode = cellCode.text.trim();
          }
        } else {
          staffCode = cellCode.text.trim();
        }

        let email = '';
        const val = cellEmail.value;
        if (val && typeof val === 'object') {
          if (
            'text' in val &&
            typeof (val as { text: unknown }).text === 'string'
          ) {
            email = String((val as { text: string }).text).trim();
          } else if (
            'hyperlink' in val &&
            typeof (val as { hyperlink: unknown }).hyperlink === 'string'
          ) {
            email = String((val as { hyperlink: string }).hyperlink)
              .replace(/^mailto:/i, '')
              .trim();
          } else if ('richText' in val && Array.isArray(val.richText)) {
            email = val.richText
              .map((t) => t.text)
              .join('')
              .trim();
          } else {
            email = cellEmail.text.trim();
          }
        } else {
          email = cellEmail.text.trim();
        }

        staffCode = staffCode.replace(/^["']+|["']+$/g, '').trim();
        email = email
          .toLowerCase()
          .replace(/^["']+|["']+$/g, '')
          .replace(/\s+/g, '');

        if (staffCode && email && email.includes('@')) {
          rows.push({ staffCode, email });
        }
      });
    }

    if (rows.length === 0) {
      throw new BadRequestException(
        'Không tìm thấy dữ liệu hợp lệ trong file (cần 2 cột: manv và email).',
      );
    }

    const overrideExisting =
      overrideExistingRaw !== undefined
        ? overrideExistingRaw === 'true' || overrideExistingRaw === '1'
        : true;

    return this.adminService.bulkAssignEmails(user.id, {
      mappings: rows,
      overrideExisting,
    });
  }

  @Patch('bulk-department')
  bulkAssignDepartment(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkAssignDepartmentDto,
  ) {
    return this.adminService.bulkAssignDepartment(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.adminService.update(user.id, id, dto);
  }

  @Post(':id/reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.resetPassword(user.id, id);
  }
}
