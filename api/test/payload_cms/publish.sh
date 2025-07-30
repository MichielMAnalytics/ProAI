#!/bin/bash

# Payload CMS Pipedream Component Publishing Script

echo "Payload CMS Pipedream Component Publisher"
echo "========================================"
echo ""

# Load environment variables from .env file
ENV_PATH="../../../.env"
if [ -f "$ENV_PATH" ]; then
    echo "Loading environment variables from .env file..."
    # Extract PIPEDREAM_PROJECT_ID from .env file safely (like the telegram script does)
    PIPEDREAM_PROJECT_ID=$(grep "^PIPEDREAM_PROJECT_ID=" "$ENV_PATH" | cut -d'=' -f2)
    export PIPEDREAM_PROJECT_ID
    echo "Using PIPEDREAM_PROJECT_ID: $PIPEDREAM_PROJECT_ID"
    
    if [ -z "$PIPEDREAM_PROJECT_ID" ]; then
        echo "Warning: PIPEDREAM_PROJECT_ID not found in .env file"
        echo "Please add PIPEDREAM_PROJECT_ID=proj_YRsVaEy to your .env file"
        exit 1
    fi
else
    echo "Warning: .env file not found at $ENV_PATH"
    echo "Please make sure the .env file exists and contains PIPEDREAM_PROJECT_ID"
    exit 1
fi

# Check if pd CLI is installed
if ! command -v pd &> /dev/null; then
    echo "Error: Pipedream CLI (pd) is not installed or not in PATH"
    echo "Please install it with: brew install pipedreamhq/pd-cli/pipedream"
    exit 1
fi

# Update Pipedream config with org_id if PIPEDREAM_PROJECT_ID is set
if [ -n "$PIPEDREAM_PROJECT_ID" ]; then
    echo "Updating Pipedream CLI config with workspace ID..."
    
    # Create or update the config file
    CONFIG_DIR="$HOME/.config/pipedream"
    CONFIG_FILE="$CONFIG_DIR/config"
    
    if [ ! -d "$CONFIG_DIR" ]; then
        mkdir -p "$CONFIG_DIR"
    fi
    
    # Read existing API key if it exists
    if [ -f "$CONFIG_FILE" ]; then
        API_KEY=$(grep "api_key" "$CONFIG_FILE" | cut -d'=' -f2 | xargs)
    fi
    
    # Write new config
    cat > "$CONFIG_FILE" << EOF
api_key = $API_KEY
org_id = $PIPEDREAM_PROJECT_ID
EOF
    
    echo "Updated config with org_id: $PIPEDREAM_PROJECT_ID"
fi

# Check if user is logged in
echo "Checking Pipedream CLI authentication..."

# Set environment (development or production)
ENVIRONMENT="${1:-development}"
if [[ "$ENVIRONMENT" != "development" && "$ENVIRONMENT" != "production" ]]; then
    echo "Invalid environment: $ENVIRONMENT"
    echo "Usage: ./publish.sh [development|production]"
    exit 1
fi

echo "Publishing to $ENVIRONMENT environment..."
echo ""

# Navigate to components directory
cd "$(dirname "$0")/components/payload-cms" || exit 1

# Skip publishing main app (it's referenced by actions, not published separately)
echo "Skipping main app (referenced by actions)..."

# Publish all actions
echo ""
echo "Publishing actions..."

# Collections actions
for action in actions/collections/*/; do
    if [ -d "$action" ]; then
        action_file="${action}$(basename "$action").mjs"
        if [ -f "$action_file" ]; then
            echo "Publishing $(basename "$action")..."
            pd publish "$action_file" --connect-environment "$ENVIRONMENT"
        fi
    fi
done

# Auth actions
for action in actions/auth/*/; do
    if [ -d "$action" ]; then
        action_file="${action}$(basename "$action").mjs"
        if [ -f "$action_file" ]; then
            echo "Publishing $(basename "$action")..."
            pd publish "$action_file" --connect-environment "$ENVIRONMENT"
        fi
    fi
done

# Globals actions
for action in actions/globals/*/; do
    if [ -d "$action" ]; then
        action_file="${action}$(basename "$action").mjs"
        if [ -f "$action_file" ]; then
            echo "Publishing $(basename "$action")..."
            pd publish "$action_file" --connect-environment "$ENVIRONMENT"
        fi
    fi
done

# Preferences actions
for action in actions/preferences/*/; do
    if [ -d "$action" ]; then
        action_file="${action}$(basename "$action").mjs"
        if [ -f "$action_file" ]; then
            echo "Publishing $(basename "$action")..."
            pd publish "$action_file" --connect-environment "$ENVIRONMENT"
        fi
    fi
done

echo ""
echo "Publishing complete!"
echo ""
echo "Your custom Payload CMS components are now available in your Pipedream workspace."
echo "They will appear with the ~/payload-cms prefix in the $ENVIRONMENT environment."