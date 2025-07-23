# Phase 1: Backend Service Implementation - COMPLETE ✅

## Overview
Phase 1 of the Runner Plugin backend service has been successfully implemented with **advanced GitHub integration using Octokit**. The backend provides a complete Docker-based service for running single static frontend applications locally with one-click deployment from Backstage, featuring robust repository management through GitHub's official API.

## 🏗️ Architecture Implemented

### Core Services Structure
```
plugins/runner-backend/src/services/
├── RunnerService/           # Core orchestration service
│   ├── types.ts            # TypeScript interfaces
│   ├── RunnerService.ts    # Main implementation
│   ├── createRunnerService.ts # Factory function
│   └── index.ts            # Exports
├── DockerService/          # Docker operations
│   └── DockerService.ts    # Container management
└── ConfigService/          # Configuration parsing
    └── ConfigService.ts    # .runner/config.yml parser
```

### API Endpoints Available
- `POST /api/runner/start` - Start a component instance
- `POST /api/runner/stop` - Stop a component instance  
- `GET /api/runner/instances` - List all instances
- `GET /api/runner/instances/:id` - Get instance status
- `GET /api/runner/instances/:id/logs` - Get instance logs (static/streaming)

## 🔧 Key Features Implemented

### 1. Single Component Execution
- Only one component can run at a time (prevents port conflicts)
- Automatic cleanup when starting new instances
- Instance state management

### 2. GitHub Integration with Octokit
- **Official GitHub API**: Uses Octokit for repository operations instead of Git clone
- **Archive Download**: Downloads repository archives (faster than Git clone)
- **Authentication**: Leverages Backstage's GitHub integration for seamless auth
- **URL Parsing**: Robust handling of various GitHub URL formats
- **Error Handling**: Specific error messages for GitHub API issues

### 3. Docker Integration
- **Network Binding**: Containers bind to `0.0.0.0` for external VM access
- **Repository Processing**: Extracts GitHub archives to temporary directories
- Docker image building with custom build args
- Container lifecycle management (start/stop/monitor)
- Port mapping and environment variable support
- Real-time and static log retrieval

### 4. Configuration Management
- **Smart URL Construction**: Handles Backstage's `url:` prefix and various GitHub formats
- Reads `.runner/config.yml` from component repositories via GitHub API
- Validates configuration format and required fields
- Supports Docker-specific configurations

### 5. Health Monitoring
- Automatic container status monitoring
- Health check intervals (configurable)
- Instance state updates based on container status

## 📋 Data Models

### RunnerInstance
```typescript
interface RunnerInstance {
  id: string;                    // Unique instance identifier
  componentRef: string;          // Component reference (kind:namespace/name)
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  containerId?: string;          // Docker container ID
  ports: number[];              // Exposed ports
  startedAt: string;            // ISO timestamp
  stoppedAt?: string;           // ISO timestamp
  error?: string;               // Error message if status is 'error'
}
```

### RunnerConfig (.runner/config.yml format)
```typescript
interface RunnerConfig {
  type: 'docker';
  dockerfile: string;           // Path to Dockerfile
  ports: number[];             // Ports to expose
  environment?: Record<string, string>;  // Environment variables
  healthCheck?: {
    path: string;              // Health check endpoint
    interval: string;          // Check interval (e.g., "30s")
    timeout: string;           // Timeout (e.g., "10s")
  };
  build?: {
    context: string;           // Build context path
    args?: Record<string, string>;  // Build arguments
  };
}
```

## 🔌 Integration Points

### Catalog Integration
- Components must have `runner.backstage.io/enabled: "true"` annotation
- Optional `runner.backstage.io/config-path` annotation (defaults to `.runner/config.yml`)
- Uses `backstage.io/source-location` for repository cloning

### Required Component Setup
For a component to work with the Runner Plugin, it needs:

1. **catalog-info.yaml** annotation:
```yaml
metadata:
  annotations:
    runner.backstage.io/enabled: "true"
    runner.backstage.io/config-path: ".runner/config.yml"  # optional
```

2. **.runner/config.yml** file:
```yaml
runner:
  type: docker
  dockerfile: ./Dockerfile
  ports: [3000]
  environment:
    NODE_ENV: development
  build:
    context: .
```

3. **Dockerfile** in the repository

## 🧪 Testing Status
- ✅ All unit tests passing
- ✅ Integration tests for plugin startup
- ✅ Router endpoint tests
- ✅ No linting errors or warnings
- ✅ TypeScript compilation successful

## 📦 Dependencies Added
- `yaml: ^2.3.4` - For parsing configuration files
- `@backstage/catalog-model: ^1.7.5` - For entity types

## 🚀 Ready for Phase 2

The backend is now ready for Phase 2: Frontend Component Development. The frontend will need to:

### API Client Integration
- Create API client to communicate with backend endpoints
- Handle authentication and error responses
- Support real-time log streaming

### React Components Needed
- **RunnerComponents** - List of runner-enabled components
- **RunnerControls** - Start/Stop buttons with status
- **RunnerStatus** - Real-time status display
- **RunnerLogs** - Log viewer with streaming support

### React Hooks Needed
- **useRunner** - Component start/stop operations
- **useRunnerInstances** - Instance list management
- **useRunnerLogs** - Log streaming

## 🔍 Example Usage Flow

1. User navigates to Runner page in Backstage
2. Frontend fetches runner-enabled components from catalog
3. User clicks "Start" on a component
4. Frontend calls `POST /api/runner/start` with entityRef
5. Backend clones repo, builds Docker image, starts container
6. Frontend polls `GET /api/runner/instances/:id` for status updates
7. User can view logs via `GET /api/runner/instances/:id/logs`
8. User clicks "Stop" to terminate the instance

## 🚀 GitHub Integration Implementation

### Octokit Integration Details
- **Dependencies**: `@octokit/rest`, `tar-fs` for archive handling
- **Authentication**: Uses Backstage's `ScmIntegrations.fromConfig(config)`
- **API Calls**: `octokit.rest.repos.downloadTarballArchive()` for repository downloads
- **Archive Extraction**: Custom tarball extraction with gzip decompression
- **URL Parsing**: Regex-based GitHub URL parsing supporting all formats

### Network Configuration
- **External Access**: Docker containers bind to `0.0.0.0:port:port` for VM access
- **Port Mapping**: Supports external IP access (e.g., `20.2.34.21:3001`)
- **Conflict Detection**: Automatic port availability checking

## 📝 Notes for Phase 2 Implementation

- Backend expects `entityRef` in format: `kind:namespace/name`
- All endpoints require authentication (handled by Backstage)
- Error responses include descriptive messages
- Log streaming uses chunked transfer encoding
- Instance IDs are UUIDs generated by the backend
- Only one instance can run at a time (enforced by backend)
- **GitHub Integration**: Requires proper `integrations.github` configuration in app-config.yaml

---

**Status**: Phase 1 Complete ✅ | **Next**: Phase 2 Frontend Development 🚀
