import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AllExceptionsFilter } from '../../src/shared/filters/all-exceptions.filter';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { RequestContextService } from '../../src/shared/context/request-context.service';
import { HealthController } from '../../src/modules/health/health.controller';
import { HealthService } from '../../src/modules/health/health.service';

describe('Health API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        RequestContextService,
        {
          provide: PrismaService,
          useValue: {
            user: { count: jest.fn().mockResolvedValue(1) },
          },
        },
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns ok', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /health/ready checks the database', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('returns RFC7807-ish problem details for unknown routes', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
    expect(response.body.requestId).toBeDefined();
    expect(response.body.status).toBe(404);
  });
});