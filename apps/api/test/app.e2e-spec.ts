import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { EscalationProcessor } from './../src/modules/alerts/escalation.processor';
import { ALERT_ESCALATION_QUEUE } from './../src/modules/alerts/notification-dispatch.service';

// Yêu cầu Postgres + Redis đang chạy
// (docker compose -f infra/docker/docker-compose.yml up -d postgres redis)
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    // Chờ kết nối BullMQ sẵn sàng — đóng app giữa lúc init sẽ ném
    // "Connection is closed" unhandled trong teardown.
    const queue = app.get<Queue>(getQueueToken(ALERT_ESCALATION_QUEUE));
    await queue.waitUntilReady();
    await app.get(EscalationProcessor).worker.waitUntilReady();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/health (GET) trả về envelope { success, data.status }', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    const body = response.body as {
      success: boolean;
      data: { status: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
  });
});
