import {
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';

import { createRouter } from './router';
import { RunnerService } from './services/RunnerService/types';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';

const mockRunnerInstance = {
  id: '123',
  componentRef: 'component:default/test-component',
  status: 'running' as const,
  ports: [3000],
  startedAt: new Date().toISOString(),
};

describe('createRouter', () => {
  let app: express.Express;
  let runnerService: jest.Mocked<RunnerService>;
  let catalog: jest.Mocked<typeof catalogServiceRef.T>;

  beforeEach(async () => {
    runnerService = {
      startComponent: jest.fn(),
      stopComponent: jest.fn(),
      getStatus: jest.fn(),
      listInstances: jest.fn(),
      getLogs: jest.fn(),
    };

    catalog = {
      getEntityByRef: jest.fn(),
    } as any;

    const router = await createRouter({
      httpAuth: mockServices.httpAuth(),
      runnerService,
      catalog,
    });
    app = express();
    app.use(router);
    app.use(mockErrorHandler());
  });

  it('should list instances', async () => {
    runnerService.listInstances.mockResolvedValue([mockRunnerInstance]);

    const response = await request(app).get('/instances');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [mockRunnerInstance] });
  });

  it('should get instance status', async () => {
    runnerService.getStatus.mockResolvedValue(mockRunnerInstance);

    const response = await request(app).get('/instances/123');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockRunnerInstance);
  });
});
