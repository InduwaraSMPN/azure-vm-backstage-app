# Docker Configuration Guide for Backstage Runner Plugin

## Overview

This guide provides comprehensive configuration options for the Docker integration in the Backstage Runner plugin. The configuration system supports global defaults, component-specific overrides, and runtime customization.

## Configuration Structure

### Global Docker Configuration

Add the following to your `app-config.yaml`:

```yaml
runner:
  docker:
    # Connection settings
    connectionTimeout: 30000      # 30 seconds
    
    # Build settings
    buildTimeout: 600000          # 10 minutes
    
    # Runtime settings
    runTimeout: 300000            # 5 minutes
    
    # Resource limits
    resourceLimits:
      memory: "1g"                # Memory limit
      cpus: "1.0"                 # CPU limit
      timeout: 3600               # Container timeout in seconds
    
    # Security options
    securityOptions:
      - "--security-opt=no-new-privileges"
      - "--read-only"
    
    # Cleanup policy
    imageCleanupPolicy: "on-error"  # always | on-error | never
```

### Component-Specific Configuration

Override settings for specific components:

```yaml
runner:
  docker:
    # Global defaults
    buildTimeout: 600000
    resourceLimits:
      memory: "1g"
      cpus: "1.0"
  
  components:
    # High-resource application
    data-processor:
      docker:
        buildTimeout: 1200000     # 20 minutes
        resourceLimits:
          memory: "4g"
          cpus: "4.0"
          timeout: 7200           # 2 hours
    
    # Quick-build application
    simple-api:
      docker:
        buildTimeout: 300000      # 5 minutes
        resourceLimits:
          memory: "512m"
          cpus: "0.5"
    
    # Development environment
    dev-environment:
      docker:
        imageCleanupPolicy: "never"
        securityOptions: []       # Disable security restrictions
```

## Configuration Options Reference

### Connection Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `connectionTimeout` | number | 30000 | Docker daemon connection timeout (ms) |

### Build Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `buildTimeout` | number | 600000 | Docker build timeout (ms) |

### Runtime Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `runTimeout` | number | 300000 | Container start timeout (ms) |

### Resource Limits

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resourceLimits.memory` | string | "1g" | Memory limit (e.g., "512m", "2g") |
| `resourceLimits.cpus` | string | "1.0" | CPU limit (e.g., "0.5", "2.0") |
| `resourceLimits.timeout` | number | 3600 | Container runtime timeout (seconds) |

### Security Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `securityOptions` | string[] | `["--security-opt=no-new-privileges"]` | Docker security options |

### Cleanup Policy

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `imageCleanupPolicy` | string | "on-error" | When to cleanup images: "always", "on-error", "never" |

## Environment-Specific Configuration

### Development Environment

```yaml
runner:
  docker:
    buildTimeout: 300000          # Faster builds
    runTimeout: 180000            # Quick startup
    resourceLimits:
      memory: "512m"              # Lower memory usage
      cpus: "1.0"
    imageCleanupPolicy: "never"   # Keep images for debugging
    securityOptions: []           # Relaxed security
```

### Production Environment

```yaml
runner:
  docker:
    buildTimeout: 1200000         # Allow longer builds
    runTimeout: 600000            # Allow longer startup
    resourceLimits:
      memory: "2g"                # More memory
      cpus: "2.0"                 # More CPU
      timeout: 7200               # 2-hour runtime limit
    imageCleanupPolicy: "always"  # Clean up resources
    securityOptions:
      - "--security-opt=no-new-privileges"
      - "--read-only"
      - "--tmpfs=/tmp"
```

### Testing Environment

```yaml
runner:
  docker:
    buildTimeout: 900000          # Medium build time
    runTimeout: 300000            # Standard startup
    resourceLimits:
      memory: "1g"
      cpus: "1.0"
      timeout: 1800               # 30-minute test runs
    imageCleanupPolicy: "on-error" # Clean up failed builds
```

## Monitoring Configuration

### Health Check Settings

```yaml
runner:
  monitoring:
    healthCheckInterval: 30000    # 30 seconds
    metricsCollectionInterval: 10000  # 10 seconds
    maxHealthCheckHistory: 100
    maxMetricsHistory: 288        # 48 hours at 10-second intervals
    alertThresholds:
      cpuUsage: 80                # CPU alert threshold (%)
      memoryUsage: 85             # Memory alert threshold (%)
      responseTime: 5000          # Response time alert (ms)
```

## Validation Rules

The configuration system validates all settings:

### Timeout Validation
- `connectionTimeout` ≥ 1000ms
- `buildTimeout` ≥ 10000ms (10 seconds)
- `runTimeout` ≥ 5000ms (5 seconds)

### Resource Validation
- `memory`: Valid formats include "512m", "1g", "2048m"
- `cpus`: Must be between 0.1 and 32.0
- `timeout`: Must be positive integer

### Security Validation
- `securityOptions`: Must be valid Docker security options
- `imageCleanupPolicy`: Must be "always", "on-error", or "never"

## Configuration Examples by Use Case

### Microservices

```yaml
runner:
  docker:
    buildTimeout: 300000          # Fast builds
    resourceLimits:
      memory: "256m"              # Lightweight
      cpus: "0.5"
  components:
    user-service:
      docker:
        resourceLimits:
          memory: "512m"          # Slightly more memory
    payment-service:
      docker:
        resourceLimits:
          memory: "1g"            # More memory for processing
          cpus: "1.0"
```

### Data Processing

```yaml
runner:
  docker:
    buildTimeout: 1800000         # 30 minutes
    runTimeout: 900000            # 15 minutes
    resourceLimits:
      memory: "8g"                # High memory
      cpus: "4.0"                 # Multiple cores
      timeout: 14400              # 4 hours
    imageCleanupPolicy: "always"  # Clean up large images
```

### Web Applications

```yaml
runner:
  docker:
    buildTimeout: 600000          # 10 minutes
    resourceLimits:
      memory: "1g"
      cpus: "1.0"
    securityOptions:
      - "--security-opt=no-new-privileges"
      - "--read-only"
      - "--tmpfs=/tmp"
      - "--tmpfs=/var/cache"
```

## Troubleshooting Configuration

### Common Configuration Issues

1. **Invalid Memory Format**
   ```yaml
   # ❌ Wrong
   memory: "1GB"
   
   # ✅ Correct
   memory: "1g"
   ```

2. **Timeout Too Low**
   ```yaml
   # ❌ Wrong (too low)
   buildTimeout: 5000
   
   # ✅ Correct
   buildTimeout: 300000
   ```

3. **Invalid CPU Limit**
   ```yaml
   # ❌ Wrong (too high)
   cpus: "50.0"
   
   # ✅ Correct
   cpus: "4.0"
   ```

### Configuration Validation

Use the validation endpoint to check your configuration:

```bash
curl http://localhost:7007/api/runner/config/validate
```

### Debug Configuration

Export configuration as environment variables for debugging:

```bash
curl http://localhost:7007/api/runner/config/env
```

## Best Practices

1. **Start with Defaults**: Use default configuration and adjust as needed
2. **Component-Specific Tuning**: Override only necessary settings per component
3. **Environment Separation**: Use different configurations for dev/test/prod
4. **Resource Monitoring**: Monitor actual resource usage to optimize limits
5. **Security First**: Always use appropriate security options in production
6. **Cleanup Strategy**: Choose appropriate cleanup policy based on environment
7. **Timeout Tuning**: Set timeouts based on actual build and startup times

## Configuration Migration

### From Basic to Advanced

1. Start with minimal configuration
2. Add monitoring and alerting
3. Implement component-specific overrides
4. Add security hardening
5. Optimize resource allocation

### Version Compatibility

- Configuration is backward compatible
- New options have sensible defaults
- Deprecated options are logged with warnings
