import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SecuritySettingsController } from './security-settings.controller';
import { SecuritySettingsService } from './security-settings.service';

@Module({
  imports: [PrismaModule],
  controllers: [SecuritySettingsController],
  providers: [SecuritySettingsService],
  exports: [SecuritySettingsService],
})
export class SecuritySettingsModule {}
