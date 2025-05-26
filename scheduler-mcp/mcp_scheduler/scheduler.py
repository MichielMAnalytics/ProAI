"""
Task scheduler implementation for MCP Scheduler.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

import croniter

from .task import Task, TaskStatus, TaskExecution, TaskType
from .persistence import Database
from .executor import Executor
from .utils import parse_cron_next_run
from .message_delivery import MessageDelivery

logger = logging.getLogger(__name__)


class Scheduler:
    """Task scheduler to manage cron-based task execution."""
    
    def __init__(self, database: Database, executor: Executor, librechat_url: str = "http://localhost:3080"):
        """Initialize the task scheduler."""
        self.database = database
        self.executor = executor
        self.message_delivery = MessageDelivery(librechat_url)
        self.active = False
        self._check_interval = 5  # seconds
        self._scheduler_task: Optional[asyncio.Task] = None
        self._running_tasks: Dict[str, asyncio.Task] = {}
    
    async def start(self):
        """Start the scheduler."""
        if self.active:
            logger.warning("Scheduler is already running")
            return
            
        logger.info("Starting scheduler")
        self.active = True
        self._scheduler_task = asyncio.create_task(self._scheduler_loop())
        
    async def stop(self):
        """Stop the scheduler."""
        if not self.active:
            logger.warning("Scheduler is not running")
            return
            
        logger.info("Stopping scheduler")
        self.active = False
        if self._scheduler_task:
            self._scheduler_task.cancel()
            try:
                await self._scheduler_task
            except asyncio.CancelledError:
                pass
            self._scheduler_task = None
            
        # Cancel any running tasks
        running_tasks = list(self._running_tasks.items())
        for task_id, task in running_tasks:
            logger.info(f"Cancelling running task: {task_id}")
            task.cancel()
    
    async def _scheduler_loop(self):
        """Main scheduler loop to check for tasks to run."""
        try:
            while self.active:
                await self._check_tasks()
                await asyncio.sleep(self._check_interval)
        except asyncio.CancelledError:
            logger.info("Scheduler loop cancelled")
            raise
        except Exception:
            logger.exception("Error in scheduler loop")
            self.active = False
            raise
    
    async def _check_tasks(self):
        """Check for tasks that need to be executed."""
        try:
            tasks = self.database.get_all_tasks()
            now = datetime.utcnow()
            
            for task in tasks:
                # Skip disabled tasks
                if not task.enabled:
                    continue
                    
                # Skip tasks that are already running
                if task.id in self._running_tasks:
                    continue
                
                # Calculate next run time if not set
                if task.next_run is None:
                    try:
                        cron = croniter.croniter(task.schedule, now)
                        task.next_run = cron.get_next(datetime)
                        self.database.save_task(task)
                    except Exception as e:
                        logger.error(f"Invalid cron expression for task {task.id}: {e}")
                        continue
                
                # Check if it's time to run the task
                if task.next_run and task.next_run <= now:
                    self._running_tasks[task.id] = asyncio.create_task(
                        self._execute_task(task)
                    )
        except Exception:
            logger.exception("Error checking tasks")
    
    async def _execute_task(self, task: Task):
        """Execute a task and update its status."""
        logger.info(f"Starting task execution: {task.id} ({task.name})")
        
        # Send start notification if user context is available
        if task.user and task.conversation_id:
            await self.message_delivery.send_task_notification(
                task.user,
                task.conversation_id,
                task.name,
                task.id,
                "started"
            )
        
        # Create execution record
        execution = TaskExecution(
            task_id=task.id,
            user=task.user  # Pass user context to execution
        )
        
        try:
            # Update task status
            task.status = TaskStatus.RUNNING
            task.last_run = datetime.utcnow()
            self.database.save_task(task)
            
            # Execute the task
            execution = await self.executor.execute_task(task)
            
            # Save execution
            self.database.save_execution(execution)
            
            # Send result message to user if context is available
            if task.user and task.conversation_id:
                success = execution.status == TaskStatus.COMPLETED
                result_content = execution.output if success else execution.error
                await self.message_delivery.send_task_result(
                    user_id=task.user,
                    conversation_id=task.conversation_id,
                    task_name=task.name,
                    task_id=task.id,
                    result=result_content or "Task completed",
                    task_type=task.type.value,
                    success=success
                )
            
            # Handle one-time tasks
            if task.do_only_once:
                task.enabled = False
                if execution.status == TaskStatus.COMPLETED:
                    logger.info(f"One-off task {task.id} completed successfully, disabling it")
                else:
                    logger.info(f"One-off task {task.id} failed, disabling it")
            else:
                # Calculate next run time for recurring tasks
                if task.schedule:
                    try:
                        task.next_run = parse_cron_next_run(task.schedule)
                    except Exception as e:
                        logger.error(f"Error calculating next run for task {task.id}: {e}")
                        task.enabled = False
            
            # Update task status
            task.status = execution.status
            task.updated_at = datetime.utcnow()
            self.database.save_task(task)
            
            logger.info(f"Task execution completed: {task.id} - Status: {task.status.value}")
            
        except Exception as e:
            logger.error(f"Error executing task {task.id}: {e}")
            
            # Update execution with error
            execution.end_time = datetime.utcnow()
            execution.status = TaskStatus.FAILED
            execution.error = str(e)
            execution.user = task.user  # Ensure user context is preserved
            self.database.save_execution(execution)
            
            # Send error notification to user if context is available
            if task.user and task.conversation_id:
                await self.message_delivery.send_task_notification(
                    task.user,
                    task.conversation_id,
                    task.name,
                    task.id,
                    "failed",
                    str(e)
                )
            
            # Update task status
            task.status = TaskStatus.FAILED
            task.updated_at = datetime.utcnow()
            
            # Disable one-time tasks that fail
            if task.do_only_once:
                task.enabled = False
                logger.info(f"One-off task {task.id} failed, disabling it")
            
            self.database.save_task(task)
            
        finally:
            # Remove from running tasks
            if task.id in self._running_tasks:
                del self._running_tasks[task.id]
    
    async def add_task(self, task: Task) -> Task:
        """Add a new task to the scheduler."""
        # Calculate initial next run time
        now = datetime.utcnow()
        try:
            cron = croniter.croniter(task.schedule, now)
            task.next_run = cron.get_next(datetime)
        except Exception as e:
            raise ValueError(f"Invalid cron expression: {e}")
        
        task.created_at = datetime.utcnow()
        task.updated_at = datetime.utcnow()
        self.database.save_task(task)
        logger.info(f"Added new task: {task.id} ({task.name})")
        return task
    
    async def update_task(self, task_id: str, **kwargs) -> Optional[Task]:
        """Update an existing task."""
        task = self.database.get_task(task_id)
        if not task:
            return None
        
        for key, value in kwargs.items():
            if hasattr(task, key):
                setattr(task, key, value)
        
        # If schedule was updated, recalculate next run time
        if "schedule" in kwargs:
            now = datetime.utcnow()
            try:
                cron = croniter.croniter(task.schedule, now)
                task.next_run = cron.get_next(datetime)
            except Exception as e:
                raise ValueError(f"Invalid cron expression: {e}")
        
        task.updated_at = datetime.utcnow()
        self.database.save_task(task)
        logger.info(f"Updated task: {task.id} ({task.name})")
        return task
    
    async def delete_task(self, task_id: str) -> bool:
        """Delete a task."""
        # Cancel the task if it's running
        if task_id in self._running_tasks:
            self._running_tasks[task_id].cancel()
            del self._running_tasks[task_id]
        
        result = self.database.delete_task(task_id)
        if result:
            logger.info(f"Deleted task: {task_id}")
        
        return result
    
    async def enable_task(self, task_id: str) -> Optional[Task]:
        """Enable a task."""
        return await self.update_task(task_id, enabled=True, status=TaskStatus.PENDING)
    
    async def disable_task(self, task_id: str) -> Optional[Task]:
        """Disable a task."""
        return await self.update_task(task_id, enabled=False, status=TaskStatus.DISABLED)
    
    async def get_task(self, task_id: str) -> Optional[Task]:
        """Get a task by ID."""
        return self.database.get_task(task_id)
    
    async def get_all_tasks(self) -> List[Task]:
        """Get all tasks."""
        return self.database.get_all_tasks()
    
    async def get_task_executions(self, task_id: str, limit: int = 10) -> List[TaskExecution]:
        """Get executions for a task."""
        return self.database.get_executions(task_id, limit)
    
    async def run_task_now(self, task_id: str) -> Optional[TaskExecution]:
        """Run a task immediately outside its schedule."""
        task = self.database.get_task(task_id)
        if not task:
            return None
        
        # Skip if the task is already running
        if task_id in self._running_tasks:
            logger.warning(f"Task {task_id} is already running")
            return None
        
        # Execute the task
        task.status = TaskStatus.RUNNING
        task.last_run = datetime.utcnow()
        self.database.save_task(task)
        
        execution = await self.executor.execute_task(task)
        self.database.save_execution(execution)
        
        # If this is a do_only_once task and it completed successfully, disable it
        if task.do_only_once and execution.status == TaskStatus.COMPLETED:
            logger.info(f"One-off task {task.id} run manually and completed, disabling it")
            task.enabled = False
            task.status = TaskStatus.DISABLED
        else:
            # Update task status for recurring tasks or failed one-off tasks
            task.status = execution.status
            
        self.database.save_task(task)
        
        return execution