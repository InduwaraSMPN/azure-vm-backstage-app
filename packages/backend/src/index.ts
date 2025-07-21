/*
 * Hi!
 *
 * Note that this is an EXAMPLE Backstage backend. Please check the README.
 *
 * Happy hacking!
 */

// Load environment variables from root .env file
require('@dotenvx/dotenvx').config({
  path: '../../.env'
});

import { createBackend } from '@backstage/backend-defaults';
import { createBackendModule } from '@backstage/backend-plugin-api';
import { DEFAULT_NAMESPACE, stringifyEntityRef } from '@backstage/catalog-model';
import { githubAuthenticator } from '@backstage/plugin-auth-backend-module-github-provider';
import {
  authProvidersExtensionPoint,
  createOAuthProviderFactory,
} from '@backstage/plugin-auth-node';

// Create the backend instance
const backend = createBackend();

// Custom auth module for GitHub.
// This module configures a custom sign-in resolver for the GitHub auth provider.
// See https://backstage.io/docs/auth/custom-auth-providers for more information.
const customGithubAuthModule = createBackendModule({
  pluginId: 'auth',
  moduleId: 'custom-github-provider',
  register(reg) {
    reg.registerInit({
      deps: { providers: authProvidersExtensionPoint },
      async init({ providers }) {
        providers.registerProvider({
          providerId: 'github',
          factory: createOAuthProviderFactory({
            authenticator: githubAuthenticator,
            async signInResolver({ profile }, ctx) {
              if (!profile.email) {
                throw new Error(
                  'Login failed, user profile does not contain an email',
                );
              }
              // Split the email into the local part and the domain.
              const [localPart] = profile.email.split('@');

              // By using `stringifyEntityRef` we ensure that the reference is formatted correctly.
              const userEntity = stringifyEntityRef({
                kind: 'User',
                name: localPart,
                namespace: DEFAULT_NAMESPACE,
              });

              return ctx.issueToken({
                claims: {
                  sub: userEntity,
                  ent: [userEntity],
                },
              });
            }
          }),
        });
      },
    });
  },
});

// --- Core Plugins ---
backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));
backend.add(import('@backstage/plugin-techdocs-backend'));
backend.add(import('@backstage/plugin-kubernetes-backend'));

// --- Auth Plugins ---
// See https://backstage.io/docs/backend-system/building-backends/migrating#the-auth-plugin
backend.add(import('@backstage/plugin-auth-backend'));
// See https://backstage.io/docs/auth/guest/provider
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
// Add the custom-configured GitHub auth provider
backend.add(customGithubAuthModule);

// --- Catalog Plugins ---
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(import('@backstage/plugin-catalog-backend-module-github'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);
// See https://backstage.io/docs/features/software-catalog/configuration#subscribing-to-catalog-errors
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));

// --- Permission Plugins ---
backend.add(import('@backstage/plugin-permission-backend'));
// See https://backstage.io/docs/permissions/getting-started for how to create your own permission policy
backend.add(
  import('@backstage/plugin-permission-backend-module-allow-all-policy'),
);

// --- Scaffolder Plugins ---
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));

// --- Search Plugins ---
backend.add(import('@backstage/plugin-search-backend'));
// Search Engine: https://backstage.io/docs/features/search/search-engines
backend.add(import('@backstage/plugin-search-backend-module-pg'));
// Search Collators
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

backend.add(import('@internal/plugin-runner-backend'));
backend.start();