"""
Enhanced MCP server implementation for MCP Scheduler.
"""
import logging
import sys
import json
import re
import platform
from typing import Dict, List, Any, Optional

from mcp.server.fastmcp import FastMCP, Context

from .task import Task, TaskStatus, TaskType
from .scheduler import Scheduler
from .config import Config
from .utils import human_readable_cron

logger = logging.getLogger(__name__)

class EnhancedJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that ensures arrays have proper comma separation."""
    def encode(self, obj):
        if isinstance(obj, (list, tuple)):
            if not obj:  # Empty list/tuple
                return '[]'
            # Ensure proper comma separation for arrays
            items = [self.encode(item) for item in obj]
            return '[' + ','.join(items) + ']'
        return super().encode(obj)

class CustomFastMCP(FastMCP):
    """Enhanced FastMCP with better JSON handling."""
    
    def _write_response(self, response: Any) -> None:
        """Override response writer to use enhanced JSON formatting."""
        try:
            # Format response with custom encoder
            response_str = json.dumps(response, cls=EnhancedJSONEncoder, ensure_ascii=False)
            # Ensure proper line ending
            if not response_str.endswith('\n'):
                response_str += '\n'
            sys.stdout.write(response_str)
            sys.stdout.flush()
        except Exception as e:
            logger.error(f"Error writing response: {e}")
            # Write fallback error response
            fallback = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32603, "message": "Internal error"}
            }
            sys.stdout.write(json.dumps(fallback) + '\n')
            sys.stdout.flush()

    def _handle_stdin(self) -> None:
        """Override stdin handler to improve JSON parsing."""
        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                    
                # Pre-process the line to fix common JSON issues
                line = line.strip()
                if not line:
                    continue
                    
                # Ensure array elements are properly comma-separated
                if '[' in line and ']' in line:
                    # Fix missing commas between array elements
                    line = re.sub(r'}\s*{', '},{', line)
                    line = re.sub(r']\s*\[', '],[', line)
                    line = re.sub(r'"\s*"', '","', line)
                
                try:
                    request = json.loads(line)
                    self._handle_request(request)
                except json.JSONDecodeError as e:
                    logger.warning(f"Invalid JSON received: {e}")
                    # Try to extract ID from malformed JSON
                    id_match = re.search(r'"id"\s*:\s*(\d+)', line)
                    id_val = id_match.group(1) if id_match else "null"
                    # Send parse error response
                    self._write_response({
                        "jsonrpc": "2.0",
                        "id": int(id_val) if id_val.isdigit() else None,
                        "error": {"code": -32700, "message": "Parse error"}
                    })
            except Exception as e:
                logger.error(f"Error handling stdin: {e}")
                if logger.isEnabledFor(logging.DEBUG):
                    logger.debug(f"Problematic line: {line}")

class SchedulerServer:
    """MCP server for task scheduling."""
    
    def __init__(self, scheduler: Scheduler, config: Config):
        """Initialize the MCP server."""
        self.scheduler = scheduler
        self.config = config
        
        # Create MCP server with custom response formatting
        self.mcp = CustomFastMCP(
            config.server_name,
            version=config.server_version,
            dependencies=[
                "croniter",
                "pydantic",
                "openai",
                "aiohttp"
            ]
        )
        
        # Register tools
        self._register_tools()
    
    def _format_json_response(self, data: Any) -> str:
        """Format JSON response to ensure compatibility with client."""
        try:
            # Use custom encoder for proper array formatting
            return json.dumps(data, cls=EnhancedJSONEncoder, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error formatting JSON response: {e}")
            # Fallback to simple error response
            return json.dumps({
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32603, "message": "Internal error"}
            })

    def _register_tools(self):
        """Register MCP tools."""
        
        @self.mcp.tool()
        async def list_tasks(
            librechat_context: Optional[Dict[str, Any]] = None,
            ctx: Context = None
        ) -> List[Dict[str, Any]]:
            """List all scheduled tasks for the current user."""
            # Extract user context if available
            user_id, conversation_id = self._extract_user_context(librechat_context=librechat_context)
            
            if user_id and hasattr(self.scheduler.database, 'get_tasks_by_user'):
                # Get tasks for specific user if user context is available
                tasks = self.scheduler.database.get_tasks_by_user(user_id)
            else:
                # Fallback to all tasks if no user context
                tasks = await self.scheduler.get_all_tasks()
            
            return [self._format_task_response(task) for task in tasks]
        
        @self.mcp.tool()
        async def get_task(
            task_id: str, 
            librechat_context: Optional[Dict[str, Any]] = None,
            ctx: Context = None
        ) -> Optional[Dict[str, Any]]:
            """Get details of a specific task.
            
            Args:
                task_id: ID of the task to retrieve
            """
            task = await self.scheduler.get_task(task_id)
            if not task:
                return None
            
            # Extract user context if available
            user_id, conversation_id = self._extract_user_context(librechat_context=librechat_context)
            
            # Check if user owns this task (if user context is available)
            if user_id and task.user and task.user != user_id:
                return None  # User doesn't own this task
            
            result = self._format_task_response(task)
            
            # Add execution history
            executions = await self.scheduler.get_task_executions(task_id)
            result["executions"] = [
                {
                    "id": exec.id,
                    "start_time": exec.start_time.isoformat(),
                    "end_time": exec.end_time.isoformat() if exec.end_time else None,
                    "status": exec.status.value,
                    "output": exec.output[:1000] if exec.output else None,  # Limit output size
                    "error": exec.error
                }
                for exec in executions
            ]
            
            return result
        
        @self.mcp.tool()
        async def add_command_task(
            name: str,
            schedule: str,
            command: str,
            description: Optional[str] = None,
            enabled: bool = True,
            do_only_once: bool = True,  # New parameter with default True
            librechat_context: Optional[Dict[str, Any]] = None,
            ctx: Context = None
        ) -> Dict[str, Any]:
            """Add a new shell command task."""
            # Extract user context if available
            user_id, conversation_id = self._extract_user_context(librechat_context=librechat_context)
            
            task = Task(
                name=name,
                schedule=schedule,
                type=TaskType.SHELL_COMMAND,
                command=command,
                description=description,
                enabled=enabled,
                do_only_once=do_only_once,
                user=user_id,
                conversation_id=conversation_id
            )
            
            task = await self.scheduler.add_task(task)
            return self._format_task_response(task)
        
        @self.mcp.tool()
        async def add_api_task(
            name: str,
            schedule: str,
            api_url: str,
            api_method: str = "GET",
            api_headers: Optional[Dict[str, str]] = None,
            api_body: Optional[Dict[str, Any]] = None,
            description: Optional[str] = None,
            enabled: bool = True,
            do_only_once: bool = True,  # New parameter with default True
            librechat_context: Optional[Dict[str, Any]] = None,
            ctx: Context = None
        ) -> Dict[str, Any]:
            """Add a new API call task."""
            # Extract user context if available
            user_id, conversation_id = self._extract_user_context(librechat_context=librechat_context)
            
            task = Task(
                name=name,
                schedule=schedule,
                type=TaskType.API_CALL,
                api_url=api_url,
                api_method=api_method,
                api_headers=api_headers,
                api_body=api_body,
                description=description,
                enabled=enabled,
                do_only_once=do_only_once,
                user=user_id,
                conversation_id=conversation_id
            )
            
            task = await self.scheduler.add_task(task)
            return self._format_task_response(task)
        
        @self.mcp.tool()
        async def add_ai_task(
            name: str,
            schedule: str,
            prompt: str,
            description: Optional[str] = None,
            enabled: bool = True,
            do_only_once: bool = True,  # New parameter with default True
            librechat_context: Optional[Dict[str, Any]] = None,
            ctx: Context = None
        ) -> Dict[str, Any]:
            """Add a new AI task."""
            # Extract user context if available
            user_id, conversation_id = self._extract_user_context(librechat_context=librechat_context)
            
            task = Task(
                name=name,
                schedule=schedule,
                type=TaskType.AI,
                prompt=prompt,
                description=description,
                enabled=enabled,
                do_only_once=do_only_once,
                user=user_id,
                conversation_id=conversation_id
            )
            
            task = await self.scheduler.add_task(task)
            return self._format_task_response(task)

        @self.mcp.tool()
        async def add_reminder_task(
            name: str,
            schedule: str,
            message: str,
            title: Optional[str] = None,
            description: Optional[str] = None,
            enabled: bool = True,
            do_only_once: bool = True,
            librechat_context: Optional[Dict[str, Any]] = None,
            ctx: Context = None
        ) -> Dict[str, Any]:
            """Add a new reminder task that shows a popup notification with sound."""
            # Extract user context if available
            user_id, conversation_id = self._extract_user_context(librechat_context=librechat_context)
            
            # Check if we have notification capabilities on this platform
            os_type = platform.system()
            has_notification_support = True
            
            if os_type == "Linux":
                # Check for notify-send or zenity
                try:
                    import shutil
                    notify_send_path = shutil.which("notify-send")
                    zenity_path = shutil.which("zenity")
                    if not notify_send_path and not zenity_path:
                        has_notification_support = False
                except ImportError:
                    # Can't check, we'll try anyway
                    pass
            
            if not has_notification_support:
                logger.warning(f"Platform {os_type} may not support notifications")
            
            task = Task(
                name=name,
                schedule=schedule,
                type=TaskType.REMINDER,
                description=description,
                enabled=enabled,
                do_only_once=do_only_once,
                reminder_title=title or name,
                reminder_message=message,
                user=user_id,
                conversation_id=conversation_id
            )
            
            task = await self.scheduler.add_task(task)
            return self._format_task_response(task)
        
        @self.mcp.tool()
        async def update_task(
            task_id: str,
            name: Optional[str] = None,
            schedule: Optional[str] = None,
            command: Optional[str] = None,
            api_url: Optional[str] = None,
            api_method: Optional[str] = None,
            api_headers: Optional[Dict[str, str]] = None,
            api_body: Optional[Dict[str, Any]] = None,
            prompt: Optional[str] = None,
            description: Optional[str] = None,
            enabled: Optional[bool] = None,
            do_only_once: Optional[bool] = None,  # New parameter
            reminder_title: Optional[str] = None, # New parameter for reminders
            reminder_message: Optional[str] = None # New parameter for reminders
        ) -> Optional[Dict[str, Any]]:
            """Update an existing task."""
            update_data = {}
            
            if name is not None:
                update_data["name"] = name
            if schedule is not None:
                update_data["schedule"] = schedule
            if command is not None:
                update_data["command"] = command
            if api_url is not None:
                update_data["api_url"] = api_url
            if api_method is not None:
                update_data["api_method"] = api_method
            if api_headers is not None:
                update_data["api_headers"] = api_headers
            if api_body is not None:
                update_data["api_body"] = api_body
            if prompt is not None:
                update_data["prompt"] = prompt
            if description is not None:
                update_data["description"] = description
            if enabled is not None:
                update_data["enabled"] = enabled
            if do_only_once is not None:
                update_data["do_only_once"] = do_only_once
            if reminder_title is not None:
                update_data["reminder_title"] = reminder_title
            if reminder_message is not None:
                update_data["reminder_message"] = reminder_message
            
            task = await self.scheduler.update_task(task_id, **update_data)
            if not task:
                return None
            
            return self._format_task_response(task)
        
        @self.mcp.tool()
        async def remove_task(
            task_id: str, 
            librechat_context: Optional[Dict[str, Any]] = None,
            ctx: Context = None
        ) -> bool:
            """Remove a task."""
            # Extract user context if available
            user_id, conversation_id = self._extract_user_context(librechat_context=librechat_context)
            
            # Check if user owns this task (if user context is available)
            if user_id:
                task = await self.scheduler.get_task(task_id)
                if not task or (task.user and task.user != user_id):
                    return False  # User doesn't own this task
            
            return await self.scheduler.delete_task(task_id)
        
        @self.mcp.tool()
        async def enable_task(task_id: str) -> Optional[Dict[str, Any]]:
            """Enable a task."""
            task = await self.scheduler.enable_task(task_id)
            if not task:
                return None
            
            return self._format_task_response(task)
        
        @self.mcp.tool()
        async def disable_task(task_id: str) -> Optional[Dict[str, Any]]:
            """Disable a task."""
            task = await self.scheduler.disable_task(task_id)
            if not task:
                return None
            
            return self._format_task_response(task)
        
        @self.mcp.tool()
        async def run_task_now(task_id: str) -> Optional[Dict[str, Any]]:
            """Run a task immediately."""
            execution = await self.scheduler.run_task_now(task_id)
            if not execution:
                return None
            
            task = await self.scheduler.get_task(task_id)
            if not task:
                return None
            
            result = self._format_task_response(task)
            result["execution"] = {
                "id": execution.id,
                "start_time": execution.start_time.isoformat(),
                "end_time": execution.end_time.isoformat() if execution.end_time else None,
                "status": execution.status.value,
                "output": execution.output[:1000] if execution.output else None,  # Limit output size
                "error": execution.error
            }
            
            return result
        
        @self.mcp.tool()
        async def get_task_executions(task_id: str, limit: int = 10) -> List[Dict[str, Any]]:
            """Get execution history for a task."""
            executions = await self.scheduler.get_task_executions(task_id, limit)
            return [
                {
                    "id": exec.id,
                    "task_id": exec.task_id,
                    "start_time": exec.start_time.isoformat(),
                    "end_time": exec.end_time.isoformat() if exec.end_time else None,
                    "status": exec.status.value,
                    "output": exec.output[:1000] if exec.output else None,  # Limit output size
                    "error": exec.error
                }
                for exec in executions
            ]
        
        @self.mcp.tool()
        async def get_server_info() -> Dict[str, Any]:
            """Get server information."""
            return {
                "name": self.config.server_name,
                "version": self.config.server_version,
                "scheduler_status": "running" if self.scheduler.active else "stopped",
                "check_interval": self.config.check_interval,
                "execution_timeout": self.config.execution_timeout,
                "ai_model": self.config.ai_model
            }
    
    def _format_task_response(self, task: Task) -> Dict[str, Any]:
        """Format a task for API response."""
        result = {
            "id": task.id,
            "name": task.name,
            "schedule": task.schedule,
            "schedule_human_readable": human_readable_cron(task.schedule),
            "type": task.type.value,
            "description": task.description,
            "enabled": task.enabled,
            "do_only_once": task.do_only_once,
            "status": task.status.value,
            "created_at": task.created_at.isoformat(),
            "updated_at": task.updated_at.isoformat(),
            "last_run": task.last_run.isoformat() if task.last_run else None,
            "next_run": task.next_run.isoformat() if task.next_run else None,
            "user": task.user,
            "conversation_id": task.conversation_id
        }
        
        # Add type-specific fields
        if task.type == TaskType.SHELL_COMMAND:
            result["command"] = task.command
            
        elif task.type == TaskType.API_CALL:
            result["api_url"] = task.api_url
            result["api_method"] = task.api_method
            result["api_headers"] = task.api_headers
            # Don't include full API body to keep response size reasonable
            if task.api_body:
                result["api_body_keys"] = list(task.api_body.keys())
            
        elif task.type == TaskType.AI:
            result["prompt"] = task.prompt
            
        elif task.type == TaskType.REMINDER:
            result["reminder_title"] = task.reminder_title
            result["reminder_message"] = task.reminder_message
            
        return result
            
    def start(self):
        """Start the MCP server."""
        print(f"Starting MCP server with {self.config.transport} transport", file=sys.stderr)
        
        try:
            # For FastMCP, only valid transport options are "stdio" or "sse"
            if self.config.transport == "stdio":
                self.mcp.run(transport="stdio")
            else:
                self.mcp.run(
                    transport="sse",
                    host=self.config.server_address,
                    port=self.config.server_port
                )
        except Exception as e:
            logger.error(f"Error starting MCP server: {e}")
            print(f"Error starting MCP server: {e}", file=sys.stderr)
            raise

    def _extract_user_context(self, librechat_context: Optional[Dict[str, Any]] = None):
        """Extract user context from tool arguments."""
        user_id = None
        conversation_id = None
        
        # Debug logging
        logger.debug(f"Extracting user context from librechat_context: {librechat_context}")
        
        # Check for LibreChat context in arguments
        if librechat_context:
            user_id = librechat_context.get('user_id')
            conversation_id = librechat_context.get('conversation_id')
            logger.debug(f"Found LibreChat context - user_id: {user_id}, conversation_id: {conversation_id}")
        else:
            logger.debug("No LibreChat context found in arguments")
        
        return user_id, conversation_id