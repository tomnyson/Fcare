import { Module, type OnModuleInit } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule implements OnModuleInit {
  constructor(private readonly importsService: ImportsService) {}

  // Task 6–9 cắm parser/committer vào đây.
  onModuleInit(): void {
    // (chưa có loại nào — Task 6 thêm CATALOG)
  }
}
