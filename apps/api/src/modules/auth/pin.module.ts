import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PinProofGuard } from '../../common/guards/pin.guard';
import { PinController } from './pin.controller';
import { PinService } from './pin.service';

/** Global để PinGuard (APP_GUARD) và PinProofGuard ở module khác inject được PinService. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [PinController],
  providers: [PinService, PinProofGuard],
  exports: [PinService, PinProofGuard],
})
export class PinModule {}
