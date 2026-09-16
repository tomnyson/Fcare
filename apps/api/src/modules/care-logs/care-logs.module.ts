import { Module } from '@nestjs/common';
import { CareLogsController } from './care-logs.controller';
import { CareLogsService } from './care-logs.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [CareLogsController],
  providers: [CareLogsService],
})
export class CareLogsModule {}
