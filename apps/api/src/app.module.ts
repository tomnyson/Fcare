import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.module';
import { CaslModule } from './casl/casl.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ConsentGuard } from './common/guards/consent.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PoliciesGuard } from './common/guards/policies.guard';
import { PiiGuardInterceptor } from './common/interceptors/pii-guard.interceptor';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { AdminModule } from './modules/admin/admin.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AuthModule } from './modules/auth/auth.module';
import { CareLogsModule } from './modules/care-logs/care-logs.module';
import { DiscussionsModule } from './modules/discussions/discussions.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { EvaluationsModule } from './modules/evaluations/evaluations.module';
import { ExcelModule } from './modules/excel/excel.module';
import { HealthModule } from './modules/health/health.module';
import { ImportsModule } from './modules/imports/imports.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { StudentAnalysesModule } from './modules/student-analyses/student-analyses.module';
import { StudentsModule } from './modules/students/students.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty' },
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    // Queue BullMQ cho escalation cảnh báo (Redis từ docker compose infra/docker).
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(
          config.get<string>('REDIS_URL', 'redis://localhost:6379'),
        );
        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            password: redisUrl.password || undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    PrismaModule,
    CaslModule,
    AuditModule,
    HealthModule,
    AuthModule,
    MasterDataModule,
    StudentsModule,
    EnrollmentsModule,
    EvaluationsModule,
    StudentAnalysesModule,
    CareLogsModule,
    DiscussionsModule,
    AlertsModule,
    StatisticsModule,
    ExcelModule,
    ImportsModule,
    AdminModule,
  ],
  providers: [
    // Thứ tự guard: rate-limit → chống CSRF → xác thực JWT → cam kết bảo mật → phân quyền CASL.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ConsentGuard },
    { provide: APP_GUARD, useClass: PoliciesGuard },
    // PII guard bọc ngoài cùng — lọc trường cấm sau khi envelope đã đóng gói.
    { provide: APP_INTERCEPTOR, useClass: PiiGuardInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
