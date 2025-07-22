import { useState, useEffect } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import useAsync from 'react-use/lib/useAsync';
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
  Link,
} from '@backstage/core-components';
import { RunnerControls } from '../RunnerControls/RunnerControls';
import { useRunnerInstances } from '../../hooks/useRunnerInstances';
import { RunnerInstance } from '../../api/RunnerApi';

export const RunnerComponents = () => {
  const catalogApi = useApi(catalogApiRef);
  const { instances, loading: instancesLoading } = useRunnerInstances();
  const [componentInstances, setComponentInstances] = useState<Map<string, RunnerInstance>>(new Map());

  const { value, loading, error } = useAsync(async (): Promise<Entity[]> => {
    const response = await catalogApi.getEntities({
      filter: {
        kind: 'Component',
        'metadata.annotations.runner.backstage.io/enabled': 'true'
      }
    });
    return response.items;
  }, []);

  // Update component instances map when instances change
  useEffect(() => {
    const instanceMap = new Map<string, RunnerInstance>();
    instances.forEach(instance => {
      instanceMap.set(instance.componentRef, instance);
    });
    setComponentInstances(instanceMap);
  }, [instances]);

  const handleInstanceChange = (entityRef: string, instance: RunnerInstance | null) => {
    const newMap = new Map(componentInstances);
    if (instance) {
      newMap.set(entityRef, instance);
    } else {
      newMap.delete(entityRef);
    }
    setComponentInstances(newMap);
  };

  if (loading || instancesLoading) {
    return <Progress />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  const columns: TableColumn<Entity>[] = [
    {
      title: 'Name',
      field: 'metadata.name',
      render: (entity: Entity) => (
        <Link to={`/catalog/default/component/${entity.metadata.name}`}>
          {entity.metadata.name}
        </Link>
      ),
    },
    {
      title: 'Description',
      field: 'metadata.description',
      render: (entity: Entity) => entity.metadata.description || 'No description'
    },
    {
      title: 'Runner Controls',
      field: 'runner',
      render: (entity: Entity) => {
        const entityRef = `${entity.kind}:${entity.metadata.namespace || 'default'}/${entity.metadata.name}`;
        const instance = componentInstances.get(entityRef);

        return (
          <RunnerControls
            entity={entity}
            instance={instance}
            onInstanceChange={(newInstance) => handleInstanceChange(entityRef, newInstance)}
          />
        );
      },
    },
  ];

  return (
    <Table
      title="Runner-Enabled Components"
      options={{ search: true, paging: true }}
      columns={columns}
      data={value || []}
    />
  );
};
