import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import useAsync from 'react-use/lib/useAsync';
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';

export const LocalhostComponents = () => {
  const catalogApi = useApi(catalogApiRef);
  
  const { value, loading, error } = useAsync(async (): Promise<Entity[]> => {
    const response = await catalogApi.getEntities({
      filter: { 'metadata.tags': 'localhost' }
    });
    return response.items;
  }, []);

  if (loading) {
    return <Progress />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  const columns: TableColumn<Entity>[] = [
    { title: 'Name', field: 'metadata.name' },
    { title: 'Kind', field: 'kind' },
    { title: 'Description', field: 'metadata.description' },
  ];

  return (
    <Table
      title="Components with 'localhost' Tag"
      options={{ search: true, paging: true }}
      columns={columns}
      data={value || []}
    />
  );
};