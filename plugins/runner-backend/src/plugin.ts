import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createRunnerService } from './services/RunnerService';

/**
 * runnerPlugin backend plugin
 *
 * @public
 */
export const runnerPlugin = createBackendPlugin({
  pluginId: 'runner',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        urlReader: coreServices.urlReader,
        catalog: catalogServiceRef,
      },
      async init({ logger, httpAuth, httpRouter, urlReader, catalog }) {
        const runnerService = await createRunnerService({
          logger,
          urlReader,
        });

        httpRouter.use(
          await createRouter({
            httpAuth,
            runnerService,
            catalog,
          }),
        );
      },
    });
  },
});
