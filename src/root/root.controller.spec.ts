import { RequestMethod, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RootController } from './root.controller';

describe('RootController', () => {
  it('returns hello world at / and ok at /cron', async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [RootController] }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: [
        { path: '/', method: RequestMethod.GET },
        { path: 'cron', method: RequestMethod.GET },
      ],
    });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    const server = app.getHttpServer();
    await request(server).get('/').expect(200).expect('hello world');
    await request(server).get('/cron').expect(200).expect('ok');
    await app.close();
  });
});
