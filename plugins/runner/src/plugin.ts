import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const runnerPlugin = createPlugin({
  id: 'runner',
  routes: {
    root: rootRouteRef,
  },
});

export const RunnerPage = runnerPlugin.provide(
  createRoutableExtension({
    name: 'RunnerPage',
    component: () =>
      import('./components/ExampleComponent').then(m => m.ExampleComponent),
    mountPoint: rootRouteRef,
  }),
);
