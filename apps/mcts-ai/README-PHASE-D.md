# Phase D: Optimization - Next Steps Guide

This document describes how to complete the next steps for Phase D optimization.

## Prerequisites

- Docker and docker-compose installed
- MCTS AI service built and available
- Game server running (optional, for full integration tests)

## Next Steps

### 1. Run Performance Benchmark

To establish baseline performance metrics:

```bash
cd apps/mcts-ai
./scripts/run-benchmark.sh
```

This will:
- Run the benchmark script inside the mcts-ai container
- Measure determinization performance (iterations per second)
- Measure MCTS search performance (loops per second)
- Generate profiling output showing hotspots

**Expected Output:**
- Determinization: ~100-500 iterations/second
- MCTS search: ~10-50 loops/second (depending on time limit)
- Profiling data showing which functions take the most time

### 2. Test Scaling Configuration

To verify that multiple MCTS AI instances can handle concurrent requests:

```bash
cd apps/mcts-ai
./scripts/test-scaling.sh 3
```

This will:
- Start 3 replicas of the mcts-ai service
- Test health endpoints across all replicas
- Verify Docker's round-robin load balancing
- Send concurrent requests to test distribution

**Expected Output:**
- All health checks should succeed
- Requests should be distributed across replicas
- No errors in container logs

### 3. Test Integration

To verify MCTS AI integrates correctly with the game server:

```bash
cd apps/mcts-ai
./scripts/test-integration.sh
```

This will:
- Test MCTS health endpoint
- Test bid endpoint with sample payload
- Test play endpoint with sample payload
- Verify server integration (if server is running)

**Expected Output:**
- All endpoints return valid responses
- Bid returns a number between 0 and cardsPerPlayer
- Play returns a valid card ID from the hand

### 4. Validate Optimizations

To verify all optimizations are in place:

```bash
cd apps/mcts-ai
./scripts/validate-optimizations.sh
```

This checks:
- `__slots__` optimization in Node class
- Determinization optimization (sorted by constraints)
- Loop count tracking for benchmarking
- Benchmark script exists
- Python syntax is valid

## Performance Analysis

After running the benchmark, analyze the profiling output to identify:

1. **Hotspots**: Functions that take the most cumulative time
2. **Bottlenecks**: Functions called frequently with high per-call time
3. **Optimization Opportunities**: 
   - Determinization function (runs every MCTS iteration)
   - Game simulation (runs during rollout)
   - Card allocation algorithm

## Scaling in Production

For production deployment with Docker Swarm:

1. Update `docker-compose.yml` (production) to include:
```yaml
services:
  mcts-ai:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
```

2. Deploy with: `docker stack deploy -c docker-compose.yml el-dorado`

3. Monitor performance and adjust replicas based on load

## Troubleshooting

### Benchmark script fails
- Ensure mcts-ai container is running: `docker-compose -f docker-compose.dev.yml up -d mcts-ai`
- Check container logs: `docker logs mcts-ai`

### Scaling test fails
- Verify docker-compose version supports `--scale` flag
- Check network connectivity between containers
- Ensure MCTS_ENDPOINT is set correctly in server environment

### Integration test fails
- Verify MCTS_ENABLED=true in server environment
- Check MCTS_ENDPOINT points to correct URL
- Review server logs for connection errors

## Performance Targets

Based on Phase D objectives:

- **Latency**: 95th percentile response time < 1.5 seconds
- **Throughput**: Support 10+ concurrent games per replica
- **Determinization**: > 100 iterations/second
- **MCTS Search**: Complete within timeout (500ms-2s)

## Next Phase

After completing Phase D:
- Monitor production performance
- Collect real-world metrics
- Identify further optimization opportunities
- Consider advanced techniques (parallel MCTS, caching, etc.)
