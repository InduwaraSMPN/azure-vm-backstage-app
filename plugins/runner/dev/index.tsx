import { createDevApp } from '@backstage/dev-utils';
import { runnerPlugin, RunnerPage } from '../src/plugin';

createDevApp()
  .registerPlugin(runnerPlugin)
  .addPage({
    element: <RunnerPage />,
    title: 'Root Page',
    path: '/runner',
  })
  .render();
