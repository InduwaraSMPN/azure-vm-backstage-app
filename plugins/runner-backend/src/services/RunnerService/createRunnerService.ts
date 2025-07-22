import { LoggerService, UrlReaderService } from '@backstage/backend-plugin-api';
import { RunnerService } from './types';
import { RunnerServiceImpl } from './RunnerService';
import { DockerService } from '../DockerService/DockerService';
import { ConfigService } from '../ConfigService/ConfigService';

export async function createRunnerService({
  logger,
  urlReader,
}: {
  logger: LoggerService;
  urlReader: UrlReaderService;
}): Promise<RunnerService> {
  logger.info('Initializing RunnerService');

  const dockerService = new DockerService(logger);
  const configService = new ConfigService(urlReader);

  return new RunnerServiceImpl(logger, dockerService, configService, urlReader);
}
