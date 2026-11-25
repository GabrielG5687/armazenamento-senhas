import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AllExceptionsFilter } from '../../src/shared/filters/all-exceptions.filter';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { RequestContextService } from '../../src/shared/context/request-context.service';

describe('Auth login API', () => {
  let app: INestApplication;
  const login = jest.fn();

  beforeAll(async () => {
    login.mockResolvedValue({
      mfaRequired: true,
      challengeToken: 'challenge-token',
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { login } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        { provide: PrismaService, useValue: {} },
        RequestContextService,
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login returns mfaRequired and a challenge token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'correct-password' })
      .expect(200);

    expect(response.body).toEqual({
      mfaRequired: true,
      challengeToken: 'challenge-token',
    });
    expect(login).toHaveBeenCalledWith(
      { email: 'user@example.com', password: 'correct-password' },
      expect.objectContaining({ ip: expect.any(String) }),
    );
  });

  it('rejects unknown properties', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'x', isAdmin: true })
      .expect(400);
  });
});
