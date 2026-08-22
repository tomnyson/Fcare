import { Module } from '@nestjs/common';
import { CareLogsController } from './care-logs.controller';
import { CareLogsService } from './care-logs.service';

@Module({
  controllers: [CareLogsController],
  providers: [CareLogsService],
})
export class CareLogsModule {}
