import { Module } from '@nestjs/common';
import { ExcelController } from './excel.controller';
import { GradesExcelService } from './grades-excel.service';
import { StudentsExcelService } from './students-excel.service';

@Module({
  controllers: [ExcelController],
  providers: [StudentsExcelService, GradesExcelService],
})
export class ExcelModule {}
