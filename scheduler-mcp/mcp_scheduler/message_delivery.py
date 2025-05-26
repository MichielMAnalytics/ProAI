"""
Message delivery functionality for sending task results back to LibreChat users.
"""
import asyncio
import aiohttp
import logging
from typing import Optional, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)

class MessageDelivery:
    """Handles delivery of messages from the scheduler back to LibreChat users."""
    
    def __init__(self, librechat_base_url: str = "http://localhost:3080"):
        """
        Initialize the message delivery service.
        
        Args:
            librechat_base_url: Base URL of the LibreChat instance
        """
        self.librechat_base_url = librechat_base_url.rstrip('/')
        # Use internal endpoints that don't require authentication
        self.task_result_endpoint = f"{self.librechat_base_url}/api/scheduler/internal/task-result"
        self.notification_endpoint = f"{self.librechat_base_url}/api/scheduler/internal/notification"
        
    async def send_task_result(
        self, 
        user_id: str, 
        conversation_id: str, 
        task_name: str, 
        task_id: str,
        result: str,
        task_type: str = "unknown",
        success: bool = True
    ) -> bool:
        """
        Send a task result message to a user in LibreChat.
        
        Args:
            user_id: The LibreChat user ID
            conversation_id: The conversation ID to send the message to
            task_name: Name of the task that completed
            task_id: ID of the task
            result: The result content to send
            task_type: Type of task (ai, command, api, reminder)
            success: Whether the task completed successfully
            
        Returns:
            bool: True if message was sent successfully, False otherwise
        """
        if not user_id or not conversation_id:
            logger.warning(f"Cannot send message for task {task_id}: missing user_id or conversation_id")
            return False
            
        payload = {
            "userId": user_id,
            "conversationId": conversation_id,
            "taskName": task_name,
            "taskId": task_id,
            "result": result,
            "taskType": task_type,
            "success": success
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.task_result_endpoint,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                    },
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        logger.info(f"Successfully sent task result for task {task_id} to user {user_id}")
                        return True
                    else:
                        error_text = await response.text()
                        logger.error(f"Failed to send task result for task {task_id}: {response.status} - {error_text}")
                        return False
                        
        except asyncio.TimeoutError:
            logger.error(f"Timeout sending task result for task {task_id}")
            return False
        except Exception as e:
            logger.error(f"Error sending task result for task {task_id}: {e}")
            return False
            
    async def send_task_notification(
        self,
        user_id: str,
        conversation_id: str,
        task_name: str,
        task_id: str,
        notification_type: str = "started",
        details: Optional[str] = None
    ) -> bool:
        """
        Send a task notification (started, failed, etc.) to a user.
        
        Args:
            user_id: The LibreChat user ID
            conversation_id: The conversation ID
            task_name: Name of the task
            task_id: ID of the task
            notification_type: Type of notification (started, failed, cancelled)
            details: Optional additional details
            
        Returns:
            bool: True if notification was sent successfully
        """
        if not user_id or not conversation_id:
            return False
            
        payload = {
            "userId": user_id,
            "conversationId": conversation_id,
            "taskName": task_name,
            "taskId": task_id,
            "notificationType": notification_type,
            "details": details
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.notification_endpoint,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        logger.info(f"Successfully sent notification for task {task_id} to user {user_id}")
                        return True
                    else:
                        error_text = await response.text()
                        logger.error(f"Failed to send notification for task {task_id}: {response.status} - {error_text}")
                        return False
        except Exception as e:
            logger.error(f"Error sending notification for task {task_id}: {e}")
            return False 