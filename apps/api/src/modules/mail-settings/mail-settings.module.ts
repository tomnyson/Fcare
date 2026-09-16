import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailSettingsController } from './mail-settings.controller';
import { MailSettingsService } from './mail-settings.service';

/** Cấu hình SMTP do ADMIN quản trị; `EmailModule` import module này để lấy config hiệu lực. */
@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [MailSettingsController],
  providers: [MailSettingsService],
  exports: [MailSettingsService],
})
export class MailSettingsModule {}
