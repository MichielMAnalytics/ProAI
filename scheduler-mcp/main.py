"""
Entry point for MCP Scheduler.
"""
import asyncio
import argparse
import logging
import os
import signal
import sys
import traceback
import threading
import json

from mcp_scheduler.config import Config
from mcp_scheduler.persistence import Database
from mcp_scheduler.mongo_persistence import MongoDatabase
from mcp_scheduler.executor import Executor
from mcp_scheduler.scheduler import Scheduler
from mcp_scheduler.server import SchedulerServer
from mcp_scheduler.utils import setup_logging

# Import our custom JSON parser utilities
try:
    from mcp_scheduler.json_parser import patch_fastmcp_parser, install_stdio_wrapper
except ImportError:
    # Define dummies if the module isn't available
    def patch_fastmcp_parser():
        return False
    def install_stdio_wrapper():
        return False

# Global variables for cleanup
scheduler = None
server = None
scheduler_task = None

def log_to_stderr(message):
    """Log messages to stderr instead of stdout to avoid interfering with stdio transport."""
    print(message, file=sys.stderr, flush=True)

def run_scheduler_in_thread(scheduler_instance):
    """Run the scheduler in a separate thread."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    async def scheduler_loop():
        await scheduler_instance.start()
        try:
            while True:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            await scheduler_instance.stop()
    
    loop.run_until_complete(scheduler_loop())
    loop.close()

def handle_sigterm(signum, frame):
    """Handle SIGTERM gracefully"""
    log_to_stderr("Received SIGTERM signal. Shutting down...")
    if scheduler:
        try:
            # Create a new event loop for clean shutdown
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(scheduler.stop())
            loop.close()
        except Exception as e:
            log_to_stderr(f"Error during shutdown: {e}")
    sys.exit(0)

# Custom input wrapper to handle malformed JSON
class SafeJsonStdin:
    def __init__(self, original_stdin):
        self.original_stdin = original_stdin
        
    def readline(self):
        line = self.original_stdin.readline()
        if not line:
            return line
            
        # Only try to fix lines that look like JSON
        if line.strip().startswith('{') or line.strip().startswith('['):
            try:
                # Parse the JSON to ensure it's valid
                json_obj = json.loads(line)
                return line
            except json.JSONDecodeError as e:
                log_to_stderr(f"Fixing malformed JSON input: {e}")
                # Try to extract the ID if present
                try:
                    import re
                    id_match = re.search(r'"id"\s*:\s*(\d+)', line)
                    if id_match:
                        id_val = id_match.group(1)
                        return f'{{"jsonrpc":"2.0","id":{id_val},"error":{{"code":-32700,"message":"Parse error"}}}}\n'
                    # Default response for malformed JSON
                    return '{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}\n'
                except Exception as ex:
                    log_to_stderr(f"Error creating error response: {ex}")
                    # Ultimate fallback
                    return '{"jsonrpc":"2.0","id":null,"error":{"code":-32603,"message":"Internal error"}}\n'
                    
        return line
        
    def __getattr__(self, name):
        return getattr(self.original_stdin, name)

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="MCP Scheduler Server")
    parser.add_argument(
        "--address", 
        default=None,
        help="Server address (default: localhost or from config/env)"
    )
    parser.add_argument(
        "--port", 
        type=int, 
        default=None,
        help="Server port (default: 8080 or from config/env)"
    )
    parser.add_argument(
        "--transport", 
        choices=["sse", "stdio"], 
        default=None,
        help="Transport mode (sse or stdio) (default: sse or from config/env)"
    )
    parser.add_argument(
        "--log-level", 
        default=None,
        help="Logging level (default: INFO or from config/env)"
    )
    parser.add_argument(
        "--log-file", 
        default=None,
        help="Log file path (default: None or from config/env)"
    )
    parser.add_argument(
        "--db-path", 
        default=None,
        help="SQLite database path or MongoDB URI (default: scheduler.db or from config/env)"
    )
    parser.add_argument(
        "--mongo-uri", 
        default=None,
        help="MongoDB URI (alternative to --db-path for MongoDB)"
    )
    parser.add_argument(
        "--config", 
        default=None,
        help="Path to JSON configuration file"
    )
    parser.add_argument(
        "--ai-model", 
        default=None,
        help="AI model to use for AI tasks (default: gpt-4o or from config/env)"
    )
    parser.add_argument(
        "--openai-api-key", 
        default=None,
        help="OpenAI API key for AI tasks (default: from OPENAI_API_KEY env var)"
    )
    parser.add_argument(
        "--librechat-url", 
        default="http://localhost:3080",
        help="LibreChat base URL for message delivery (default: http://localhost:3080)"
    )
    parser.add_argument(
        "--version", 
        action="store_true",
        help="Show version and exit"
    )
    parser.add_argument(
        "--debug", 
        action="store_true",
        help="Enable debug mode with full traceback"
    )
    parser.add_argument(
        "--fix-json", 
        action="store_true",
        help="Enable JSON fixing for malformed messages"
    )
    
    args = parser.parse_args()
    
    # Set environment variables for config
    if args.config:
        os.environ["MCP_SCHEDULER_CONFIG_FILE"] = args.config
    
    if args.address:
        os.environ["MCP_SCHEDULER_ADDRESS"] = args.address
    
    if args.port:
        os.environ["MCP_SCHEDULER_PORT"] = str(args.port)
    
    if args.transport:
        os.environ["MCP_SCHEDULER_TRANSPORT"] = args.transport
    
    if args.log_level:
        os.environ["MCP_SCHEDULER_LOG_LEVEL"] = args.log_level
    
    if args.log_file:
        os.environ["MCP_SCHEDULER_LOG_FILE"] = args.log_file
    
    if args.db_path:
        os.environ["MCP_SCHEDULER_DB_PATH"] = args.db_path
    
    if args.mongo_uri:
        os.environ["MCP_SCHEDULER_MONGO_URI"] = args.mongo_uri
    
    if args.ai_model:
        os.environ["MCP_SCHEDULER_AI_MODEL"] = args.ai_model
    
    if args.openai_api_key:
        os.environ["OPENAI_API_KEY"] = args.openai_api_key
    
    # Enable debug mode
    debug_mode = args.debug
    
    # Register signal handlers
    signal.signal(signal.SIGTERM, handle_sigterm)
    
    try:
        # Install JSON fixing patches if requested or always in debug mode
        if args.fix_json or debug_mode:
            # Try to patch the FastMCP parser directly
            if not patch_fastmcp_parser():
                # If direct patching fails, use stdin wrapper as fallback
                if not install_stdio_wrapper():
                    # Last resort: replace stdin with our custom wrapper
                    log_to_stderr("Installing basic JSON fix wrapper")
                    sys.stdin = SafeJsonStdin(sys.stdin)
                    
        # Load configuration
        config = Config()
        
        # Show version and exit if requested
        if args.version:
            log_to_stderr(f"{config.server_name} version {config.server_version}")
            sys.exit(0)
        
        # Configure logging - ensure it goes to a file or stderr, not stdout
        if not config.log_file and config.transport == "stdio":
            # Force a log file when using stdio transport if none was specified
            config.log_file = "mcp_scheduler.log"
            
        setup_logging(config.log_level, config.log_file)
        
        # Initialize components
        # Check if db_path is a MongoDB URI
        if config.db_path.startswith(('mongodb://', 'mongodb+srv://')):
            log_to_stderr("Using MongoDB for persistence")
            database = MongoDatabase(config.db_path)
        else:
            log_to_stderr("Using SQLite for persistence")
            database = Database(config.db_path)
            
        executor = Executor(config.openai_api_key, config.ai_model)
        executor.execution_timeout = config.execution_timeout
        
        global scheduler
        scheduler = Scheduler(database, executor, args.librechat_url)
        
        global server
        server = SchedulerServer(scheduler, config)
        
        # Start the scheduler in a separate thread
        scheduler_thread = threading.Thread(
            target=run_scheduler_in_thread,
            args=(scheduler,),
            daemon=True  # Make thread a daemon so it exits when the main thread exits
        )
        scheduler_thread.start()
        log_to_stderr(f"Scheduler started in background thread")
        
        # Start the MCP server (this will block with stdio transport)
        log_to_stderr(f"Starting MCP server with {config.transport} transport")
        server.start()
        
    except KeyboardInterrupt:
        log_to_stderr("Interrupted by user")
        sys.exit(0)
    except json.JSONDecodeError as e:
        log_to_stderr(f"JSON parsing error: {e}")
        if debug_mode:
            traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        log_to_stderr(f"Error during initialization: {e}")
        if debug_mode:
            traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()