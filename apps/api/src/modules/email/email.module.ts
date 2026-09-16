import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailSettingsModule } from '../mail-settings/mail-settings.module';
import { EmailService } from './email.service';
import { EmailProcessor, EMAIL_NOTIFICATION_QUEUE } from './email.processor';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    MailSettingsModule,
    BullModule.registerQueue({
      name: EMAIL_NOTIFICATION_QUEUE,
    }),
  ],
  providers: [EmailService, EmailProcessor],
  exports: [EmailService, BullModule],
})
export class EmailModule {}
