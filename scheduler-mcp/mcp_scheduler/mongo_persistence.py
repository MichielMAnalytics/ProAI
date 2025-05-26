"""
MongoDB persistence layer for MCP Scheduler.
"""
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse

try:
    from pymongo import MongoClient
    from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
    PYMONGO_AVAILABLE = True
except ImportError:
    PYMONGO_AVAILABLE = False
    MongoClient = None

from .task import Task, TaskExecution, TaskStatus, TaskType

logger = logging.getLogger(__name__)


class MongoDatabase:
    """MongoDB database for task persistence."""
    
    def __init__(self, mongo_uri: str, database_name: str = None):
        """Initialize the MongoDB connection."""
        if not PYMONGO_AVAILABLE:
            raise ImportError("pymongo is required for MongoDB support. Install with: pip install pymongo>=4.0.0")
        
        self.mongo_uri = mongo_uri
        
        # Extract database name from URI if not provided
        if database_name is None:
            self.database_name = self._extract_database_name_from_uri(mongo_uri)
        else:
            self.database_name = database_name
            
        self.client = None
        self.db = None
        self.tasks_collection = None
        self.executions_collection = None
        
        self._connect()
        self._create_indexes()
    
    def _extract_database_name_from_uri(self, uri: str) -> str:
        """Extract database name from MongoDB URI."""
        try:
            parsed = urlparse(uri)
            # Remove leading slash from path
            db_name = parsed.path.lstrip('/')
            
            # Remove query parameters if present (e.g., ?tls=true&authMechanism=...)
            if '?' in db_name:
                db_name = db_name.split('?')[0]
            
            # If no database name in URI, use default
            if not db_name:
                logger.warning("No database name found in MongoDB URI, using default 'scheduler'")
                return "scheduler"
            
            logger.info(f"Extracted database name from URI: {db_name}")
            return db_name
            
        except Exception as e:
            logger.warning(f"Failed to extract database name from URI: {e}, using default 'scheduler'")
            return "scheduler"
    
    def _connect(self):
        """Establish connection to MongoDB."""
        try:
            self.client = MongoClient(
                self.mongo_uri,
                serverSelectionTimeoutMS=5000,  # 5 second timeout
                connectTimeoutMS=5000,
                socketTimeoutMS=5000
            )
            
            # Test the connection
            self.client.admin.command('ping')
            
            self.db = self.client[self.database_name]
            # Use collection names that match LibreChat's Mongoose models
            self.tasks_collection = self.db.schedulertasks
            self.executions_collection = self.db.schedulerexecutions
            
            logger.info(f"Connected to MongoDB database: {self.database_name}")
            
        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error connecting to MongoDB: {e}")
            raise
    
    def _create_indexes(self):
        """Create necessary indexes for performance."""
        try:
            # Index on task ID for fast lookups
            self.tasks_collection.create_index("id", unique=True)
            
            # Index on task status and enabled for scheduler queries
            self.tasks_collection.create_index([("enabled", 1), ("status", 1)])
            
            # Index on next_run for scheduler queries
            self.tasks_collection.create_index("next_run")
            
            # Index on user for user-specific queries
            self.tasks_collection.create_index("user")
            
            # Index on execution ID for fast lookups
            self.executions_collection.create_index("id", unique=True)
            
            # Index on task_id for execution queries
            self.executions_collection.create_index("task_id")
            
            # Index on user for user-specific execution queries
            self.executions_collection.create_index("user")
            
            # Compound index on task_id and start_time for execution history
            self.executions_collection.create_index([("task_id", 1), ("start_time", -1)])
            
        except Exception as e:
            logger.warning(f"Failed to create indexes: {e}")
    
    def save_task(self, task: Task) -> None:
        """Save a task to the database."""
        try:
            task_doc = {
                "id": task.id,
                "name": task.name,
                "schedule": task.schedule,
                "type": task.type.value,
                "command": task.command,
                "api_url": task.api_url,
                "api_method": task.api_method,
                "api_headers": task.api_headers,
                "api_body": task.api_body,
                "prompt": task.prompt,
                "description": task.description,
                "enabled": task.enabled,
                "do_only_once": task.do_only_once,
                "last_run": task.last_run,
                "next_run": task.next_run,
                "status": task.status.value,
                "created_at": task.created_at,
                "updated_at": task.updated_at,
                "reminder_title": task.reminder_title,
                "reminder_message": task.reminder_message,
                "user": task.user,
                "conversation_id": task.conversation_id
            }
            
            # Use upsert to insert or update
            self.tasks_collection.replace_one(
                {"id": task.id},
                task_doc,
                upsert=True
            )
            
        except Exception as e:
            logger.error(f"Failed to save task {task.id}: {e}")
            raise
    
    def get_task(self, task_id: str) -> Optional[Task]:
        """Get a task by ID."""
        try:
            doc = self.tasks_collection.find_one({"id": task_id})
            if not doc:
                return None
            
            return self._doc_to_task(doc)
            
        except Exception as e:
            logger.error(f"Failed to get task {task_id}: {e}")
            return None
    
    def get_all_tasks(self) -> List[Task]:
        """Get all tasks from the database."""
        try:
            docs = list(self.tasks_collection.find())
            return [self._doc_to_task(doc) for doc in docs]
        except Exception as e:
            logger.error(f"Failed to get all tasks: {e}")
            return []
    
    def get_tasks_by_user(self, user_id: str) -> List[Task]:
        """Get all tasks for a specific user."""
        try:
            docs = list(self.tasks_collection.find({"user": user_id}))
            return [self._doc_to_task(doc) for doc in docs]
        except Exception as e:
            logger.error(f"Failed to get tasks for user {user_id}: {e}")
            return []
    
    def delete_task(self, task_id: str) -> bool:
        """Delete a task by ID."""
        try:
            result = self.tasks_collection.delete_one({"id": task_id})
            return result.deleted_count > 0
            
        except Exception as e:
            logger.error(f"Failed to delete task {task_id}: {e}")
            return False
    
    def save_execution(self, execution: TaskExecution) -> None:
        """Save a task execution to the database."""
        try:
            execution_doc = {
                "id": execution.id,
                "task_id": execution.task_id,
                "start_time": execution.start_time,
                "end_time": execution.end_time,
                "status": execution.status.value,
                "output": execution.output,
                "error": execution.error,
                "user": execution.user
            }
            
            # Use upsert to insert or update
            self.executions_collection.replace_one(
                {"id": execution.id},
                execution_doc,
                upsert=True
            )
            
        except Exception as e:
            logger.error(f"Failed to save execution {execution.id}: {e}")
            raise
    
    def get_executions(self, task_id: str, limit: int = 10) -> List[TaskExecution]:
        """Get executions for a task, ordered by start time (newest first)."""
        try:
            docs = list(
                self.executions_collection
                .find({"task_id": task_id})
                .sort("start_time", -1)
                .limit(limit)
            )
            return [self._doc_to_execution(doc) for doc in docs]
        except Exception as e:
            logger.error(f"Failed to get executions for task {task_id}: {e}")
            return []
    
    def get_executions_by_user(self, user_id: str, limit: int = 50) -> List[TaskExecution]:
        """Get executions for a specific user, ordered by start time (newest first)."""
        try:
            docs = list(
                self.executions_collection
                .find({"user": user_id})
                .sort("start_time", -1)
                .limit(limit)
            )
            return [self._doc_to_execution(doc) for doc in docs]
        except Exception as e:
            logger.error(f"Failed to get executions for user {user_id}: {e}")
            return []
    
    def _doc_to_task(self, doc: Dict[str, Any]) -> Task:
        """Convert a MongoDB document to a Task object."""
        return Task(
            id=doc["id"],
            name=doc["name"],
            schedule=doc["schedule"],
            type=TaskType(doc["type"]),
            command=doc.get("command"),
            api_url=doc.get("api_url"),
            api_method=doc.get("api_method"),
            api_headers=doc.get("api_headers"),
            api_body=doc.get("api_body"),
            prompt=doc.get("prompt"),
            description=doc.get("description"),
            enabled=doc.get("enabled", True),
            do_only_once=doc.get("do_only_once", True),
            last_run=doc.get("last_run"),
            next_run=doc.get("next_run"),
            status=TaskStatus(doc.get("status", TaskStatus.PENDING.value)),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
            reminder_title=doc.get("reminder_title"),
            reminder_message=doc.get("reminder_message"),
            user=doc.get("user"),
            conversation_id=doc.get("conversation_id")
        )
    
    def _doc_to_execution(self, doc: Dict[str, Any]) -> TaskExecution:
        """Convert a MongoDB document to a TaskExecution object."""
        return TaskExecution(
            id=doc["id"],
            task_id=doc["task_id"],
            start_time=doc["start_time"],
            end_time=doc.get("end_time"),
            status=TaskStatus(doc["status"]),
            output=doc.get("output"),
            error=doc.get("error"),
            user=doc.get("user")
        )
    
    def close(self):
        """Close the MongoDB connection."""
        if self.client:
            self.client.close()
            logger.info("MongoDB connection closed") 