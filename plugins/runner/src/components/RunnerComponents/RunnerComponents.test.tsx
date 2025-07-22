
import { render } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { runnerApiRef } from '../../api/RunnerApi';
import { errorApiRef } from '@backstage/core-plugin-api';
import { RunnerComponents } from './RunnerComponents';

const mockCatalogApi = {
  getEntities: jest.fn(),
  getEntityByRef: jest.fn(),
  getEntityByName: jest.fn(),
  removeEntityByUid: jest.fn(),
  getLocationById: jest.fn(),
  getLocationByRef: jest.fn(),
  addLocation: jest.fn(),
  removeLocationById: jest.fn(),
  refreshEntity: jest.fn(),
  getEntityAncestors: jest.fn(),
  getEntityFacets: jest.fn(),
  validateEntity: jest.fn(),
};

const mockRunnerApi = {
  startComponent: jest.fn(),
  stopComponent: jest.fn(),
  getStatus: jest.fn(),
  listInstances: jest.fn(),
  getLogs: jest.fn(),
};

const mockErrorApi = {
  post: jest.fn(),
  error$: jest.fn(),
};

describe('RunnerComponents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogApi.getEntities.mockResolvedValue({ items: [] });
    mockRunnerApi.listInstances.mockResolvedValue([]);
  });

  it('renders without crashing', () => {
    const { container } = render(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [runnerApiRef, mockRunnerApi],
          [errorApiRef, mockErrorApi],
        ]}
      >
        <RunnerComponents />
      </TestApiProvider>
    );
    expect(container).toBeInTheDocument();
  });

  it('calls catalog API to fetch components', () => {
    render(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [runnerApiRef, mockRunnerApi],
          [errorApiRef, mockErrorApi],
        ]}
      >
        <RunnerComponents />
      </TestApiProvider>
    );

    expect(mockCatalogApi.getEntities).toHaveBeenCalledWith({
      filter: {
        kind: 'Component',
        'metadata.annotations.runner.backstage.io/enabled': 'true'
      }
    });
  });
});
