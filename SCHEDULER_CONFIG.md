# Scheduler Configuration

The scheduler now supports task queue management with concurrency limits and improved error handling. Below are the available environment variables for configuration:

## Environment Variables

### `SCHEDULER_CONCURRENCY` (default: 3)
Maximum number of concurrent task executions. This prevents overwhelming the system when multiple tasks are scheduled at the same time.

### `SCHEDULER_TASK_TIMEOUT` (default: 300000)
Timeout for individual task execution in milliseconds (5 minutes by default). Tasks that exceed this timeout will be terminated.

### `SCHEDULER_RETRY_TIMEOUT` (default: 180000)
Timeout for task retries in milliseconds (3 minutes by default). Retry attempts have a shorter timeout than initial executions.

### `SCHEDULER_MAX_RETRIES` (default: 3)
Maximum number of retry attempts for failed tasks. Only tasks with retriable errors will be retried.

### `SCHEDULER_SHUTDOWN_TIMEOUT` (default: 60000)
Timeout for graceful shutdown in milliseconds (1 minute by default). The scheduler will wait this long for active tasks to complete before forcing shutdown.

## Example Configuration

Add these to your `.env` file:

```bash
# Scheduler Configuration
SCHEDULER_CONCURRENCY=3
SCHEDULER_TASK_TIMEOUT=300000
SCHEDULER_RETRY_TIMEOUT=180000
SCHEDULER_MAX_RETRIES=3
SCHEDULER_SHUTDOWN_TIMEOUT=60000
```

## Features Implemented

- ✅ **Concurrency Control**: Limits simultaneous task executions
- ✅ **Task Prioritization**: Prioritizes one-time tasks, older tasks, and retries
- ✅ **Retry Logic**: Automatic retries with exponential backoff for retriable errors
- ✅ **Timeouts**: Prevents hanging tasks
- ✅ **Rate Limiting**: Prevents overwhelming external services
- ✅ **Graceful Shutdown**: Waits for active tasks before stopping
- ✅ **Monitoring**: Queue status tracking and logging
- ✅ **Error Classification**: Distinguishes between retriable and non-retriable errors

## Monitoring Endpoint

Use `GET /api/scheduler/status` to monitor queue status and configuration.

## Production Recommendations

- Set `SCHEDULER_CONCURRENCY` to 2-5 depending on your server resources
- Monitor the `/api/scheduler/status` endpoint for queue health
- Adjust timeouts based on your typical AI response times
- Consider alerting when queue sizes grow too large 