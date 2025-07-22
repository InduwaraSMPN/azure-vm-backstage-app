import { LoggerService, UrlReaderService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { RunnerService } from './types';
import { RunnerServiceImpl } from './RunnerService';
import { DockerService } from '../DockerService/DockerService';
import { ConfigService } from '../ConfigService/ConfigService';
import { DockerConfigService } from '../DockerConfigService';
import { DockerConfig } from '../../utils/dockerUtils';

export async function createRunnerService({
  logger,
  urlReader,
  config,
  dockerConfig,
}: {
  logger: LoggerService;
  urlReader: UrlReaderService;
  config: Config;
  dockerConfig?: Partial<DockerConfig>;
}): Promise<RunnerService> {
  logger.info('Initializing RunnerService');

  // Initialize Docker configuration service
  const dockerConfigService = new DockerConfigService(config, logger);
  const finalDockerConfig = { ...dockerConfigService.getConfig(), ...dockerConfig };

  const dockerService = new DockerService(logger, finalDockerConfig);
  await dockerService.initialize(); // Initialize Docker service

  const configService = new ConfigService(urlReader);

  return new RunnerServiceImpl(logger, dockerService, configService);
}
