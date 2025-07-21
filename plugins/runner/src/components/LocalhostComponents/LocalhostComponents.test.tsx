import { render } from '@testing-library/react';
import { LocalhostComponents } from './LocalhostComponents';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { TestApiProvider } from '@backstage/test-utils';
import { Entity } from '@backstage/catalog-model';
import { errorApiRef } from '@backstage/core-plugin-api';

describe('LocalhostComponents', () => {
  const mockErrorApi = {
    post: jest.fn(),
    error$: jest.fn(),
  };

  const mockCatalogApi = {
    getEntities: jest.fn().mockImplementation(async () => ({
      items: [
        {
          kind: 'Component',
          metadata: {
            name: 'localhost-service',
            description: 'Service running on localhost',
            tags: ['localhost'],
          },
        },
        {
          kind: 'Component',
          metadata: {
            name: 'other-service',
            description: 'Service not on localhost',
            tags: ['production'],
          },
        },
      ] as Entity[],
    })),
  };

  it('should render loading state', async () => {
    const { getByTestId } = render(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [errorApiRef, mockErrorApi],
        ]}
      >
        <LocalhostComponents />
      </TestApiProvider>,
    );
    expect(getByTestId('progress')).toBeInTheDocument();
  });

  it('should render filtered components', async () => {
    const { findByText, queryByText } = render(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [errorApiRef, mockErrorApi],
        ]}
      >
        <LocalhostComponents />
      </TestApiProvider>,
    );

    expect(await findByText('localhost-service')).toBeInTheDocument();
    expect(queryByText('other-service')).not.toBeInTheDocument();
    expect(await findByText("Components with 'localhost' Tag")).toBeInTheDocument();
  });
});