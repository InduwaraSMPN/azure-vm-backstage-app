import { startTestBackend } from '@backstage/backend-test-utils';
import { runnerPlugin } from './plugin';
import request from 'supertest';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';

describe('plugin', () => {
  it('should start the runner plugin and list instances', async () => {
    const { server } = await startTestBackend({
      features: [
        runnerPlugin,
        catalogServiceMock.factory({
          entities: [],
        }),
      ],
    });

    // Test that the instances endpoint is available and returns empty list
    const response = await request(server).get('/api/runner/instances');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });

  it('should return error for non-existent instance', async () => {
    const { server } = await startTestBackend({
      features: [
        runnerPlugin,
        catalogServiceMock.factory({
          entities: [],
        }),
      ],
    });

    // Test that getting a non-existent instance returns an error
    const response = await request(server).get('/api/runner/instances/non-existent-id');
    expect(response.status).toBe(500); // Will be 500 because the service throws an error for non-existent instances
  });
});
