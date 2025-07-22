import {
  createPlugin,
  createRoutableExtension,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';
import { runnerApiRef, RunnerApiClient } from './api/RunnerApi';

export const runnerPlugin = createPlugin({
  id: 'runner',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: runnerApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new RunnerApiClient(discoveryApi, fetchApi),
    }),
  ],
});

export const RunnerPage = runnerPlugin.provide(
  createRoutableExtension({
    name: 'RunnerPage',
    component: () =>
      import('./components/RunnerComponents').then(m => m.RunnerComponents),
    mountPoint: rootRouteRef,
  }),
);
