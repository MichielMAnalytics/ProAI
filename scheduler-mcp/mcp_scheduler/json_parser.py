"""
Enhanced JSON parser for MCP messages.
Replace the content of json_parser.py with this improved version.
"""
import json
import logging
import sys
import re
from typing import Tuple, Optional, Any

logger = logging.getLogger(__name__)

def safe_parse_json(json_str: str) -> Tuple[Optional[Any], Optional[str]]:
    """
    Parse JSON safely, with enhanced error recovery.
    
    Args:
        json_str: The JSON string to parse
        
    Returns:
        Tuple of (parsed_json, error_message)
        If parsing succeeds, error_message will be None
        If parsing fails, parsed_json will be None
    """
    if not json_str or not isinstance(json_str, str):
        return None, "Invalid JSON input"
    
    json_str = json_str.strip()
    if not json_str:
        return None, "Empty JSON string"
    
    # Try parsing normally first
    try:
        return json.loads(json_str), None
    except json.JSONDecodeError as e:
        # Don't log every parse error as it's too noisy
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(f"JSON parse error: {e}, attempting to fix")
            position = e.pos
            context_start = max(0, position - 20)
            context_end = min(len(json_str), position + 20)
            context = json_str[context_start:context_end]
            error_marker = ' ' * (position - context_start) + '^'
            logger.debug(f"Error near: {context}\n{error_marker}")
        
        # Enhanced error recovery
        fixed_json = json_str
        
        # Fix 1: Missing comma between array elements
        if "Expected ',' or ']'" in str(e):
            try:
                # More precise comma insertion
                before = json_str[:e.pos].rstrip()
                after = json_str[e.pos:].lstrip()
                if before and after and before[-1] not in ',:{}[]' and after[0] not in ',:{}[]':
                    fixed_json = before + ',' + after
                    return json.loads(fixed_json), None
            except (json.JSONDecodeError, IndexError):
                pass
        
        # Fix 2: Unescaped quotes in strings
        if "Unterminated string" in str(e) or "Invalid control character" in str(e):
            try:
                # Improved quote escaping
                fixed_json = re.sub(r'(?<!\\)"(?=(?:(?!"|\n).)*"(?!"))', r'\"', json_str)
                return json.loads(fixed_json), None
            except (json.JSONDecodeError, re.error):
                pass
        
        # Fix 3: Missing closing brackets/braces
        if "Expecting ',' or '}'" in str(e) or "Expecting ',' or ']'" in str(e):
            try:
                # Count opening and closing brackets/braces
                opens = sum(1 for c in json_str if c in '{[')
                closes = sum(1 for c in json_str if c in '}]')
                if opens > closes:
                    # Add missing closing brackets/braces
                    fixed_json = json_str + '}' * (opens - closes)
                    return json.loads(fixed_json), None
            except json.JSONDecodeError:
                pass
        
        # Fix 4: Extra data after JSON document
        if "Extra data" in str(e):
            try:
                # Try to find where the main JSON document ends
                for i in range(len(json_str), 0, -1):
                    try:
                        result = json.loads(json_str[:i])
                        return result, None
                    except json.JSONDecodeError:
                        continue
            except Exception:
                pass
        
        # If all fixes failed, return a more helpful error message
        error_msg = f"JSON parse error: {str(e)}"
        if str(e).startswith("Expecting"):
            error_msg += " (syntax error)"
        elif "Invalid control character" in str(e):
            error_msg += " (invalid character)"
        elif "Unterminated string" in str(e):
            error_msg += " (unclosed string)"
            
        return None, error_msg

def patch_fastmcp_parser():
    """
    Patch the FastMCP JSON parser with enhanced error handling.
    """
    try:
        from mcp.server.fastmcp import utils
        original_parse = utils.parse_json
        
        def patched_parse_json(data, *args, **kwargs):
            if isinstance(data, bytes):
                try:
                    data = data.decode('utf-8')
                except UnicodeDecodeError:
                    logger.error("Failed to decode input as UTF-8")
                    return {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}
            
            result, error = safe_parse_json(data)
            if error:
                # Only log actual errors, not routine parse issues
                if not any(expected in error for expected in ["Expected ',' or ']'", "Expected ',' or '}'", "Extra data"]):
                    logger.warning(f"JSON parse error: {error}")
                
                # Return a valid JSON-RPC error response
                try:
                    # Try to extract the ID if present
                    id_match = re.search(r'"id"\s*:\s*(\d+|"[^"]*"|null)', data)
                    id_val = json.loads(id_match.group(1)) if id_match else None
                except Exception:
                    id_val = None
                
                return {
                    "jsonrpc": "2.0",
                    "id": id_val,
                    "error": {
                        "code": -32700,
                        "message": "Parse error",
                        "data": error if logger.isEnabledFor(logging.DEBUG) else None
                    }
                }
            return result
        
        # Apply the patch
        utils.parse_json = patched_parse_json
        logger.info("Successfully patched FastMCP JSON parser")
        return True
        
    except ImportError:
        logger.error("Failed to import MCP module for patching")
        return False
    except AttributeError:
        logger.error("Failed to find parse_json function in MCP module")
        return False
    except Exception as e:
        logger.error(f"Error patching FastMCP JSON parser: {e}")
        return False

def install_stdio_wrapper():
    """
    Install a wrapper around stdin/stdout to handle malformed JSON.
    """
    original_stdin = sys.stdin
    
    class StdinWrapper:
        def readline(self):
            line = original_stdin.readline()
            if not line:
                return line
            
            # Only attempt to fix lines that look like JSON
            line = line.strip()
            if line and (line.startswith('{') or line.startswith('[')):
                result, error = safe_parse_json(line)
                if error:
                    # Extract ID if possible
                    try:
                        id_match = re.search(r'"id"\s*:\s*(\d+|"[^"]*"|null)', line)
                        id_val = id_match.group(1) if id_match else "null"
                        return f'{{"jsonrpc":"2.0","id":{id_val},"error":{{"code":-32700,"message":"Parse error"}}}}\n'
                    except Exception:
                        return '{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}\n'
                
                # If we successfully parsed and fixed it, return the fixed version
                if result is not None:
                    return json.dumps(result) + '\n'
            
            return line
        
        def __getattr__(self, name):
            return getattr(original_stdin, name)
    
    sys.stdin = StdinWrapper()
    logger.info("Installed stdin wrapper for JSON fixing")
    return True