import { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import { RunnerService } from './services/RunnerService/types';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';

export async function createRouter({
  httpAuth,
  runnerService,
  catalog,
}: {
  httpAuth: HttpAuthService;
  runnerService: RunnerService;
  catalog: typeof catalogServiceRef.T;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  // Schema validation
  const startComponentSchema = z.object({
    entityRef: z.string(),
  });

  const stopComponentSchema = z.object({
    instanceId: z.string(),
  });

  // Start component endpoint
  router.post('/start', async (req, res) => {
    const parsed = startComponentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const credentials = await httpAuth.credentials(req, { allow: ['user'] });

    // Get entity from catalog
    const entity = await catalog.getEntityByRef(parsed.data.entityRef, { credentials });
    if (!entity) {
      throw new NotFoundError(`Entity not found: ${parsed.data.entityRef}`);
    }

    // Check if entity has runner annotation
    const runnerEnabled = entity.metadata.annotations?.['runner.backstage.io/enabled'];
    if (runnerEnabled !== 'true') {
      throw new InputError('Component is not enabled for runner');
    }

    const instance = await runnerService.startComponent(entity);
    res.status(201).json(instance);
  });

  // Stop component endpoint
  router.post('/stop', async (req, res) => {
    const parsed = stopComponentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    await runnerService.stopComponent(parsed.data.instanceId, { credentials: await httpAuth.credentials(req) });
    res.status(200).json({ message: 'Component stopped successfully' });
  });

  // Get instance status
  router.get('/instances/:id', async (req, res) => {
    const instance = await runnerService.getStatus(req.params.id);
    res.json(instance);
  });

  // List all instances
  router.get('/instances', async (_req, res) => {
    const instances = await runnerService.listInstances();
    res.json({ items: instances });
  });

  // Get instance logs
  router.get('/instances/:id/logs', async (req, res) => {
    const follow = req.query.follow === 'true';
    const tail = req.query.tail ? parseInt(req.query.tail as string, 10) : undefined;

    const logs = await runnerService.getLogs(req.params.id, { follow, tail });

    if (typeof logs === 'string') {
      res.json({ logs });
    } else {
      // Stream logs for real-time updates
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');
      logs.pipe(res);
    }
  });

  // Get instance statistics
  router.get('/instances/:id/stats', async (req, res) => {
    try {
      const stats = await runnerService.getInstanceStats(req.params.id);
      res.json({ stats });
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : 'Failed to get instance stats'
      });
    }
  });

  // Get instance health
  router.get('/instances/:id/health', async (req, res) => {
    try {
      const health = await runnerService.getInstanceHealth(req.params.id);
      res.json({ health });
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : 'Failed to get instance health'
      });
    }
  });

  // Get instance metrics
  router.get('/instances/:id/metrics', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const metrics = await runnerService.getInstanceMetrics(req.params.id, limit);
      res.json({ metrics });
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : 'Failed to get instance metrics'
      });
    }
  });

  // Get instance errors
  router.get('/instances/:id/errors', async (req, res) => {
    try {
      const errors = await runnerService.getInstanceErrors(req.params.id);
      res.json({ errors });
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : 'Failed to get instance errors'
      });
    }
  });

  // Get error history
  router.get('/errors', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const errors = await runnerService.getErrorHistory(limit);
      res.json({ errors });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get error history'
      });
    }
  });

  return router;
}
