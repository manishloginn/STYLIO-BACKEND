import { ServiceUnavailableException } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports the database as up when ping succeeds', async () => {
    const connection = {
      readyState: 1,
      db: { admin: () => ({ ping: async () => ({ ok: 1 }) }) },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: getConnectionToken(), useValue: connection }],
    }).compile();
    const result = await moduleRef.get(HealthController).check();
    expect(result).toEqual({ status: 'ok', database: 'up' });
  });

  it('fails when the database is disconnected', async () => {
    const connection = { readyState: 0, db: { admin: () => ({ ping: async () => ({ ok: 1 }) }) } };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: getConnectionToken(), useValue: connection }],
    }).compile();
    await expect(moduleRef.get(HealthController).check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
