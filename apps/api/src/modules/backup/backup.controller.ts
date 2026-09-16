import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import * as fs from 'fs';
import type { AppAbility } from '../../casl/ability.factory';
import { CheckPolicies } from '../../common/decorators/check-policies.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupService } from './backup.service';
import { CreateBackupDto } from './dto/create-backup.dto';
import { RestoreBackupDto } from './dto/restore-backup.dto';
import { UpdateScheduleConfigDto } from './dto/update-schedule-config.dto';

@ApiTags('admin')
@Controller('admin/backup')
@CheckPolicies((ability: AppAbility) => ability.can('manage', 'Backup'))
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly schedulerService: BackupSchedulerService,
  ) {}

  @Get()
  list() {
    return this.backupService.listBackups();
  }

  @Get('stats')
  getStats() {
    return this.backupService.getOverviewStats();
  }

  @Get('config')
  getConfig() {
    return this.backupService.getScheduleConfig();
  }

  @Put('config')
  async updateConfig(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateScheduleConfigDto,
  ) {
    const updated = this.backupService.updateScheduleConfig(dto, user.id);
    await this.schedulerService.syncSchedule(updated);
    return updated;
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBackupDto) {
    return this.backupService.createBackup({
      comment: dto.comment,
      staffId: user.id,
      type: 'MANUAL',
    });
  }

  @Get(':id/download')
  async download(@Param('id') id: string): Promise<StreamableFile> {
    const backup = await this.backupService.getBackupById(id);
    if (!fs.existsSync(backup.filepath)) {
      throw new BadRequestException('Tệp sao lưu không tồn tại trên đĩa');
    }

    const stream = fs.createReadStream(backup.filepath);
    return new StreamableFile(stream, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${backup.filename}"`,
    });
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 500 * 1024 * 1024 }, // Tối đa 500MB
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('comment') comment?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn tệp .dump để tải lên');
    }
    return this.backupService.saveUploadedBackup(
      {
        buffer: file.buffer,
        originalname: file.originalname,
        size: file.size,
      },
      comment,
      user.id,
    );
  }

  @Post(':id/restore')
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  restore(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RestoreBackupDto,
  ) {
    return this.backupService.restoreBackup(id, {
      confirmation: dto.confirmation,
      staffId: user.id,
    });
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.backupService.deleteBackup(id, user.id);
    return { success: true, deletedId: id };
  }
}
