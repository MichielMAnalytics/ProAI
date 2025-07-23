const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { FileContext } = require('librechat-data-provider');
const { v4: uuidv4 } = require('uuid');

// Session pool manager to handle multiple concurrent users
class TelegramSessionPool {
  static clients = new Map(); // sessionKey -> { client, isConnecting, lastUsed }
  static currentIndex = 0;
  static sessionKeys = [];
  static lastReuseLog = 0; // Track when we last logged reuse to reduce noise

  static initialize() {
    // Discover available session strings
    this.sessionKeys = [];
    for (let i = 1; i <= 10; i++) {
      const sessionKey = `TELEGRAM_SESSION_STRING_${i}`;
      const sessionString = getEnvironmentVariable(sessionKey);
      if (sessionString) {
        this.sessionKeys.push(sessionKey);
        console.log(`📱 Found session pool entry: ${sessionKey}`);
      }
    }

    // No fallback needed - using numbered session pool system only

    if (this.sessionKeys.length === 0) {
      throw new Error(
        'No Telegram session strings found. Please configure TELEGRAM_SESSION_STRING_1, _2, _3, _4, etc.',
      );
    }

    console.log(`🏊 Telegram session pool initialized with ${this.sessionKeys.length} session(s)`);
  }

  static async getClient() {
    if (this.sessionKeys.length === 0) {
      this.initialize();
    }

    // PHASE 1: Try to reuse any existing connected client first (most efficient)
    for (const [sessionKey, clientInfo] of this.clients.entries()) {
      if (clientInfo && clientInfo.client && clientInfo.client.connected) {
        clientInfo.lastUsed = Date.now();
        // Only log reuse occasionally to reduce noise
        const now = Date.now();
        if (!this.lastReuseLog || now - this.lastReuseLog > 30000) {
          console.log(`♻️ Reusing session: ${sessionKey}`);
          this.lastReuseLog = now;
        }
        return clientInfo.client;
      }
    }

    // PHASE 2: Wait for any connecting sessions to complete (avoid duplicate connections)
    const connectingSessions = Array.from(this.clients.entries()).filter(
      ([_, clientInfo]) => clientInfo && clientInfo.isConnecting,
    );

    if (connectingSessions.length > 0) {
      // Wait up to 10 seconds for any connection to complete
      const maxWaitTime = 10000;
      const checkInterval = 100;
      let waitTime = 0;

      while (waitTime < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        waitTime += checkInterval;

        // Check if ANY session has connected successfully
        for (const [sessionKey, clientInfo] of this.clients.entries()) {
          if (clientInfo && clientInfo.client && clientInfo.client.connected) {
            clientInfo.lastUsed = Date.now();
            return clientInfo.client;
          }
        }

        // Check if all connecting sessions have finished (success or failure)
        const stillConnecting = Array.from(this.clients.entries()).some(
          ([_, clientInfo]) => clientInfo && clientInfo.isConnecting,
        );

        if (!stillConnecting) {
          break;
        }
      }
    }

    // PHASE 3: Create new connection with proper locking to prevent AUTH_KEY_DUPLICATED
    const maxAttempts = this.sessionKeys.length * 2;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const sessionKey = this.sessionKeys[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.sessionKeys.length;

      try {
        const clientInfo = this.clients.get(sessionKey);

        // Skip if this session is already connecting or recently failed
        if (clientInfo && (clientInfo.isConnecting || clientInfo.failedAt)) {
          // Clear old failures after 30 seconds
          if (clientInfo.failedAt && Date.now() - clientInfo.failedAt > 30000) {
            this.clients.delete(sessionKey);
          } else {
            continue;
          }
        }

        // Immediately mark as connecting to prevent race conditions
        this.clients.set(sessionKey, {
          client: null,
          isConnecting: true,
          lastUsed: Date.now(),
          failedAt: null,
        });

        // Create new client
        console.log(`🔌 Connecting session: ${sessionKey}`);
        const client = await this._createClient(sessionKey);

        // Update with successful connection
        this.clients.set(sessionKey, {
          client,
          isConnecting: false,
          lastUsed: Date.now(),
          failedAt: null,
        });

        // Small delay to ensure connection is fully established for reuse
        await new Promise((resolve) => setTimeout(resolve, 100));
        return client;
      } catch (error) {
        console.log(`❌ Failed to create client for ${sessionKey}: ${error.message}`);

        // Mark as failed to prevent immediate retry
        this.clients.set(sessionKey, {
          client: null,
          isConnecting: false,
          lastUsed: Date.now(),
          failedAt: Date.now(),
        });

        // For AUTH_KEY_DUPLICATED errors, add extra delay before trying next session
        if (error.message.includes('AUTH_KEY_DUPLICATED')) {
          console.log(`🔄 AUTH_KEY_DUPLICATED detected, waiting 2s before next attempt...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // After delay, check if another request has already succeeded
          for (const [checkSessionKey, checkClientInfo] of this.clients.entries()) {
            if (checkClientInfo && checkClientInfo.client && checkClientInfo.client.connected) {
              checkClientInfo.lastUsed = Date.now();
              return checkClientInfo.client;
            }
          }
        }
      }
    }

    throw new Error('All Telegram sessions in pool failed to connect');
  }

  static async _createClient(sessionKey) {
    try {
      const sessionString = getEnvironmentVariable(sessionKey);
      if (!sessionString) {
        throw new Error(`Session string not found: ${sessionKey}`);
      }

      const apiId = getEnvironmentVariable('TELEGRAM_API_ID');
      const apiHash = getEnvironmentVariable('TELEGRAM_API_HASH');

      if (!apiId || !apiHash) {
        throw new Error(
          'TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables are required.',
        );
      }

      const session = new StringSession(sessionString);
      const client = new TelegramClient(session, parseInt(apiId), apiHash, {
        connectionRetries: 3,
        floodSleepThreshold: 60,
        autoReconnect: true,
        maxConcurrentDownloads: 1,
      });

      await client.start({
        phoneNumber: () => {
          throw new Error('Interactive authentication not supported.');
        },
        password: () => {
          throw new Error('Interactive authentication not supported.');
        },
        phoneCode: () => {
          throw new Error('Interactive authentication not supported.');
        },
        onError: (err) => {
          console.error(`Telegram auth error for ${sessionKey}:`, err);
        },
      });

      console.log(`✅ Session connected: ${sessionKey}`);
      return client;
    } catch (error) {
      // Don't delete from clients here - let getClient handle failure tracking
      throw error;
    }
  }

  static async cleanup() {
    console.log('🧹 Cleaning up Telegram session pool...');
    for (const [sessionKey, clientInfo] of this.clients.entries()) {
      if (clientInfo.client) {
        try {
          await clientInfo.client.disconnect();
        } catch (error) {
          console.log(`Warning: Failed to disconnect ${sessionKey}:`, error.message);
        }
      }
    }
    this.clients.clear();
  }
}

class TelegramChannelFetcher extends Tool {
  name = 'telegram';
  description =
    'Fetch messages from PUBLIC Telegram channels ONLY. This tool strictly supports public broadcast channels with usernames (like @cointelegraph). Private chats, private groups, and private channels are blocked for privacy and security reasons. IMPORTANT: For analysis queries like "most interesting", "top posts", "important news", or "best articles", DO NOT set a limit - let the tool fetch ALL messages in the date range automatically (up to 500). Only set explicit limits for basic "recent messages" queries. The tool returns complete message data including engagement statistics for intelligent filtering and analysis.';

  schema = z.object({
    channel_name: z
      .string()
      .min(1)
      .describe(
        'PUBLIC channel username (without @) or channel ID. Only public broadcast channels with usernames are supported (like "cointelegraph", "bitcoin"). Private chats, groups, and channels are blocked.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe(
        'Maximum number of messages to fetch. IMPORTANT: For content analysis queries (most interesting, top posts, etc.), DO NOT specify this parameter - let the tool auto-fetch all messages in the date range (up to 500). Only specify for simple "recent messages" queries. Defaults: 500 with date filters, 10 without.',
      ),
    offset_date: z
      .string()
      .optional()
      .describe('Fetch messages before this date. Format: YYYY-MM-DD or ISO date string.'),
    min_date: z
      .string()
      .optional()
      .describe('Fetch messages after this date. Format: YYYY-MM-DD or ISO date string.'),
    max_date: z
      .string()
      .optional()
      .describe('Fetch messages before this date. Format: YYYY-MM-DD or ISO date string.'),
    include_images: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether to download and save images to files. Images will be saved using the configured file strategy (local, Firebase, S3, Azure Blob). Defaults to false to reduce latency.',
      ),
  });

  constructor(fields = {}) {
    super();
    this.envVarApiId = 'TELEGRAM_API_ID';
    this.envVarApiHash = 'TELEGRAM_API_HASH';
    this.override = fields.override ?? false;
    this.apiId = fields[this.envVarApiId] ?? getEnvironmentVariable(this.envVarApiId);
    this.apiHash = fields[this.envVarApiHash] ?? getEnvironmentVariable(this.envVarApiHash);

    // File strategy properties for image saving
    this.userId = fields.userId;
    this.fileStrategy = fields.fileStrategy;
    if (fields.uploadImageBuffer) {
      this.uploadImageBuffer = fields.uploadImageBuffer.bind(this);
    }

    if (!this.override && (!this.apiId || !this.apiHash)) {
      throw new Error(`Missing ${this.envVarApiId} or ${this.envVarApiHash} environment variable.`);
    }

    // Validate at least one session string is provided
    if (!this.override) {
      let hasAnySession = false;
      for (let i = 1; i <= 10; i++) {
        if (getEnvironmentVariable(`TELEGRAM_SESSION_STRING_${i}`)) {
          hasAnySession = true;
          break;
        }
      }
      if (!hasAnySession) {
        throw new Error(
          'Missing Telegram session strings. Please add TELEGRAM_SESSION_STRING_1, _2, etc. to your .env file.',
        );
      }
    }

    // Rate limiting: track request history per user for burst allowance
    this.requestHistory = {};
  }

  async initializeClient() {
    let lastError;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use session pool to get a client
        const client = await TelegramSessionPool.getClient();
        return client;
      } catch (error) {
        lastError = error;
        console.error(
          `Client initialization attempt ${attempt}/${maxRetries} failed:`,
          error.message,
        );

        // Check if it's an auth-related error that might be resolved with a different session
        if (
          error.message.includes('AUTH_KEY_DUPLICATED') ||
          error.message.includes('AUTH_KEY_UNREGISTERED') ||
          error.message.includes('SESSION_PASSWORD_NEEDED')
        ) {
          console.log(`🔄 Auth error detected, will try different session on next attempt...`);
          // Small delay before retry
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        // For non-auth errors, don't retry
        break;
      }
    }

    throw new Error(
      `Failed to initialize Telegram client after ${maxRetries} attempts: ${lastError.message}`,
    );
  }

  parseDate(dateString) {
    if (!dateString) return null;

    try {
      // Try to parse as YYYY-MM-DD format first
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return new Date(dateString + 'T00:00:00Z');
      }

      // Try to parse as ISO date string
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format');
      }

      return date;
    } catch (error) {
      throw new Error(`Invalid date format: ${dateString}. Use YYYY-MM-DD or ISO date string.`);
    }
  }

  async _call(input) {
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${JSON.stringify(validationResult.error.issues)}`);
    }

    const {
      channel_name,
      limit,
      offset_date,
      min_date,
      max_date,
      include_images = false,
    } = validationResult.data;

    const offsetDate = offset_date
      ? Math.floor(this.parseDate(offset_date).getTime() / 1000)
      : undefined;

    // For same-day queries, handle dates properly as full day boundaries
    let minDate = null;
    let maxDate = null;

    if (min_date) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(min_date)) {
        // Start of day in local timezone
        const [year, month, day] = min_date.split('-').map(Number);
        minDate = new Date(year, month - 1, day, 0, 0, 0, 0);
      } else {
        minDate = this.parseDate(min_date);
      }
    }

    if (max_date) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(max_date)) {
        // End of day in local timezone
        const [year, month, day] = max_date.split('-').map(Number);
        maxDate = new Date(year, month - 1, day, 23, 59, 59, 999);
      } else {
        maxDate = this.parseDate(max_date);
      }
    }

    // Smart pagination logic: when date filtering is used, fetch comprehensive data
    const isDateFiltered = min_date || max_date || offset_date;
    const effectiveLimit = limit || (isDateFiltered ? 2000 : 10);

    // 🛡️ ROBUSTNESS VALIDATIONS - Prevent system overload

    // 1. Image download limits - prevent memory/bandwidth exhaustion
    if (include_images && effectiveLimit > 20) {
      throw new Error(
        'Image downloads are limited to 20 messages maximum. Reduce your limit or set include_images=false for larger requests.',
      );
    }

    // 2. Date range validation - prevent massive historical requests
    if (minDate && maxDate) {
      const daysDiff = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 90) {
        throw new Error(
          `Date range spans ${daysDiff} days, maximum allowed is 90 days. Please use a shorter date range.`,
        );
      }
      // No message limit restrictions for date ranges - let users get comprehensive data
    }

    // 3. Large request warnings - educate users about efficiency
    if (effectiveLimit > 200 && !isDateFiltered) {
      throw new Error(
        'Large requests (>200 messages) require date filtering (min_date/max_date) to prevent retrieving excessive data. Please add date filters.',
      );
    }

    // 4. Reasonable limits enforcement
    if (effectiveLimit > 2500) {
      throw new Error('Maximum limit is 2500 messages per request to maintain system performance.');
    }

    // 5. Rate limiting with burst allowance - allow 5 rapid calls, then enforce limits
    const userId = this.userId || 'default';
    const now = Date.now();
    const burstWindow = 10000; // 10 second window
    const burstLimit = 5; // Allow 5 calls in burst window
    // Initialize user history if not exists
    if (!this.requestHistory[userId]) {
      this.requestHistory[userId] = [];
    }

    // Clean old requests outside the burst window
    const userHistory = this.requestHistory[userId];
    this.requestHistory[userId] = userHistory.filter((timestamp) => now - timestamp < burstWindow);

    // Check if user has exceeded burst limit
    if (this.requestHistory[userId].length >= burstLimit) {
      const oldestInWindow = Math.min(...this.requestHistory[userId]);
      const timeSinceOldest = now - oldestInWindow;

      if (timeSinceOldest < burstWindow) {
        const remainingTime = Math.ceil((burstWindow - timeSinceOldest) / 1000);
        throw new Error(
          `Rate limit: You've made ${burstLimit} requests in 10 seconds. Please wait ${remainingTime} seconds before making another request.`,
        );
      }
    }

    // Add current request to history
    this.requestHistory[userId].push(now);

    try {
      const client = await this.initializeClient();

      // Validate date range
      if (offsetDate && minDate && new Date(offsetDate * 1000) <= minDate) {
        throw new Error('offset_date must be after min_date');
      }
      if (minDate && maxDate && minDate > maxDate) {
        console.log(`❌ Date validation failed: minDate (${minDate}) > maxDate (${maxDate})`);
        console.log(
          `   minDate.getTime() = ${minDate.getTime()}, maxDate.getTime() = ${maxDate.getTime()}`,
        );
        throw new Error('min_date must not be after max_date');
      }

      // If max_date is provided but no offset_date, use max_date as offset_date for GramJS
      // IMPORTANT: offsetDate in Telegram means "fetch messages BEFORE this date"
      let finalOffsetDate = offsetDate;
      if (!offsetDate && maxDate) {
        // For same-day queries, we need to fetch messages before the NEXT day
        if (minDate && minDate.toDateString() === maxDate.toDateString()) {
          const nextDay = new Date(maxDate);
          nextDay.setDate(nextDay.getDate() + 1); // Add one day
          nextDay.setHours(0, 0, 0, 0); // Set to midnight of next day
          finalOffsetDate = Math.floor(nextDay.getTime() / 1000);
        } else {
          // For date ranges, use the day after max_date to include all messages on max_date
          const dayAfterMax = new Date(maxDate);
          dayAfterMax.setDate(dayAfterMax.getDate() + 1);
          dayAfterMax.setHours(0, 0, 0, 0);
          finalOffsetDate = Math.floor(dayAfterMax.getTime() / 1000);
        }
      }

      // Get the channel entity with retry logic
      let channel;
      const maxRetries = 2;
      let lastError;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Try to get channel by username or ID
          if (channel_name.startsWith('-100')) {
            // Channel ID format
            channel = await client.getEntity(parseInt(channel_name));
          } else {
            // Username format (add @ if not present)
            const username = channel_name.startsWith('@') ? channel_name : `@${channel_name}`;
            channel = await client.getEntity(username);
          }

          // 🛡️ SECURITY CHECK: Only allow public channels, block private chats
          if (channel.className === 'User') {
            throw new Error(
              `Access denied: "${channel_name}" is a private user chat. This tool only supports public channels for privacy and security reasons.`,
            );
          }

          if (channel.className === 'Chat' && !channel.broadcast) {
            throw new Error(
              `Access denied: "${channel_name}" is a private group chat. This tool only supports public channels for privacy and security reasons.`,
            );
          }

          if (channel.className === 'Channel' && !channel.broadcast) {
            throw new Error(
              `Access denied: "${channel_name}" is a private channel. This tool only supports public broadcast channels.`,
            );
          }

          // Additional check for megagroups that aren't public
          if (channel.megagroup && !channel.username) {
            throw new Error(
              `Access denied: "${channel_name}" is a private megagroup. This tool only supports public channels with usernames.`,
            );
          }

          break; // Success, exit retry loop
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
          }
        }
      }

      if (!channel) {
        throw new Error(
          `Channel "${channel_name}" not found or not accessible after ${maxRetries} attempts. Make sure it's a public channel and the name is correct. Last error: ${lastError?.message}`,
        );
      }

      // Fetch messages with automatic continuation when limit is reached
      const messages = [];
      const startTime = Date.now();
      const timeoutMs = include_images ? 120000 : 60000; // 2min for images, 1min for text
      let currentOffsetDate = finalOffsetDate;
      let totalFetched = 0;
      let batchCount = 0;
      const maxBatches = 5; // Prevent infinite loops, max 2500 messages total

      while (totalFetched < effectiveLimit && batchCount < maxBatches) {
        batchCount++;
        const remainingLimit = effectiveLimit - totalFetched;
        const batchLimit = Math.min(remainingLimit, 500); // Fetch up to 500 per batch

        if (batchCount > 1) {
          console.log(
            `📡 Batch ${batchCount}: fetching ${batchLimit} more messages from ${channel_name}${currentOffsetDate ? ` (from ${new Date(currentOffsetDate * 1000).toISOString().split('T')[0]})` : ''}`,
          );
        }

        let batchMessages = [];
        let batchHitMinDate = false;
        let oldestMessageDate = null;

        for await (const message of client.iterMessages(channel, {
          limit: batchLimit,
          offsetDate: currentOffsetDate,
          reverse: false, // Get newest first
        })) {
          // Timeout protection
          if (Date.now() - startTime > timeoutMs) {
            console.log(
              `⏰ Request timeout after ${timeoutMs / 1000}s, returning ${messages.length} messages`,
            );
            break;
          }

          // Convert message datetime to Date object for comparison
          const messageDateTime =
            message.date instanceof Date ? message.date : new Date(message.date * 1000);

          // Apply min_date filter manually since GramJS doesn't have this built-in
          if (minDate && messageDateTime < minDate) {
            batchHitMinDate = true;
            break; // Stop when we reach messages older than min_date
          }

          // Apply max_date filter manually (only needed when offset_date wasn't used)
          if (maxDate && messageDateTime > maxDate) {
            continue; // Skip messages newer than max_date
          }

          // Skip deleted or empty messages
          if (!message.message && !message.media) {
            continue;
          }

          // Track oldest message date for next batch offset
          oldestMessageDate = messageDateTime;

          // Extract entities (links, mentions, cashtags, etc.)
          const entities = [];
          if (message.entities) {
            for (const entity of message.entities) {
              const entityData = {
                type: entity.className.replace('MessageEntity', '').toLowerCase(),
                offset: entity.offset,
                length: entity.length,
                text: message.message.substring(entity.offset, entity.offset + entity.length),
              };

              // Add URL for text URLs
              if (entity.className === 'MessageEntityTextUrl') {
                entityData.url = entity.url;
              }

              // Add user ID for mentions
              if (entity.userId) {
                entityData.userId = entity.userId;
              }

              entities.push(entityData);
            }
          }

          // Convert datetime to ISO string - reuse the messageDateTime from above
          const dateString = messageDateTime.toISOString();

          // Extract media information and optionally download images
          let mediaInfo = null;
          if (message.media) {
            mediaInfo = {
              type: message.media.className,
              has_spoiler: message.media.spoiler || false,
            };

            // Add specific info for photos and optionally download them
            if (message.media.className === 'MessageMediaPhoto' && message.media.photo) {
              mediaInfo.photo_id = message.media.photo.id;
              mediaInfo.access_hash = message.media.photo.accessHash;

              if (include_images && this.uploadImageBuffer) {
                try {
                  // Download the image as a buffer
                  const imageBuffer = await client.downloadMedia(message.media, {
                    progressCallback: null, // No progress callback for simplicity
                  });

                  if (imageBuffer) {
                    // Generate a unique filename for the image
                    const imageName = `telegram_img_${message.id}_${uuidv4()}.jpg`;
                    const fileId = uuidv4();

                    // Create a mock request object with the required properties
                    const mockReq = {
                      user: { id: this.userId },
                      app: {
                        locals: {
                          fileStrategy: this.fileStrategy,
                          imageOutputType: 'jpeg',
                        },
                      },
                      file: {
                        originalname: imageName,
                      },
                    };

                    // Use the uploadImageBuffer function to save the image
                    const result = await this.uploadImageBuffer({
                      req: mockReq,
                      context: FileContext.image_generation,
                      metadata: {
                        buffer: imageBuffer,
                        filename: imageName,
                        file_id: fileId,
                        type: 'image/jpeg',
                        bytes: imageBuffer.length,
                        width: null, // We don't have dimensions from Telegram
                        height: null,
                      },
                      resize: false, // Don't resize, keep original
                    });

                    mediaInfo.image_url = result.filepath;
                    mediaInfo.image_file_id = result.file_id;
                    mediaInfo.image_size = imageBuffer.length;
                    mediaInfo.image_format = 'jpeg'; // Telegram photos are usually JPEG
                  }
                } catch (downloadError) {
                  console.error(
                    `Failed to download image for message ${message.id}:`,
                    downloadError,
                  );
                  mediaInfo.download_error = downloadError.message;
                }
              }
            }

            // Add TTL if present
            if (message.media.ttlSeconds) {
              mediaInfo.ttl_seconds = message.media.ttlSeconds;
            }
          }

          // Calculate engagement score for intelligent filtering
          const views = message.views || 0;
          const forwards = message.forwards || 0;
          const replies = message.replies ? message.replies.replies : 0;
          const engagementScore = views + forwards * 10 + replies * 25; // Weight replies/forwards higher

          const messageData = {
            id: message.id,
            text: message.message || '',
            date: dateString,
            sender_id: message.senderId,
            views: views,
            forwards: forwards,
            replies: replies,
            engagement_score: engagementScore,
            is_reply: !!message.replyTo,
            entities: entities.length > 0 ? entities : undefined,
            media: mediaInfo,
          };

          // Add sender information if available
          if (message.sender) {
            messageData.sender = {
              id: message.sender.id,
              username: message.sender.username || null,
              first_name: message.sender.firstName || null,
              last_name: message.sender.lastName || null,
            };
          }

          batchMessages.push(messageData);
        }

        // Add batch messages to main collection
        messages.push(...batchMessages);
        totalFetched += batchMessages.length;

        // Stop if we hit min_date boundary or got less than requested (end of channel)
        if (batchHitMinDate || batchMessages.length < batchLimit) {
          break;
        }

        // Prepare offset for next batch using oldest message date
        if (oldestMessageDate) {
          // Add 1 second to avoid fetching the same message again
          currentOffsetDate = Math.floor(oldestMessageDate.getTime() / 1000) - 1;
        } else {
          break; // No more messages to fetch
        }
      }

      const endTime = Date.now();
      const processingTime = Math.round((endTime - startTime) / 1000);

      // Generate warnings if limits were hit
      const warnings = [];
      if (messages.length >= effectiveLimit) {
        warnings.push(
          `Reached message limit of ${effectiveLimit}. Use date filtering for more targeted results.`,
        );
      }
      if (batchCount >= maxBatches) {
        warnings.push(
          `Reached maximum batch limit (${maxBatches} batches). Some messages may not be included.`,
        );
      }
      if (include_images && messages.filter((m) => m.media?.image_url).length > 0) {
        warnings.push(
          `Image downloads were processed. This increases processing time and bandwidth usage.`,
        );
      }
      if (processingTime > 30) {
        warnings.push(
          `Request took ${processingTime}s to process. Consider reducing the limit or date range for faster responses.`,
        );
      }

      const result = {
        channel: {
          id: channel.id,
          title: channel.title,
          username: channel.username,
          participants_count: channel.participantsCount || null,
        },
        messages: messages,
        total_fetched: messages.length,
        processing_time_seconds: processingTime,
        warnings: warnings.length > 0 ? warnings : undefined,
        filters_applied: {
          limit: effectiveLimit,
          offset_date: offset_date || null,
          min_date: min_date || null,
          max_date: max_date || null,
          include_images: include_images,
          smart_pagination: isDateFiltered,
        },
      };

      console.log(
        `✅ ${channel_name}: ${messages.length} messages (${processingTime}s)${batchCount > 1 ? ` [${batchCount} batches]` : ''}`,
      );

      return JSON.stringify(result, null, 2);
    } catch (error) {
      console.error('❌ Telegram fetch error:', error.message);

      // Don't expose internal errors to users, provide helpful guidance instead
      if (error.message.includes('timeout')) {
        throw new Error(
          'Request timed out. Try reducing the message limit or date range for faster processing.',
        );
      } else if (error.message.includes('not found')) {
        throw new Error(
          `Channel "${channel_name}" not found or not accessible. Make sure it's a public channel and the name is correct.`,
        );
      } else if (error.message.includes('Rate limit')) {
        throw error; // Pass through rate limit errors as-is
      } else {
        throw new Error(
          `Failed to fetch messages from ${channel_name}. Please try again or contact support if the issue persists.`,
        );
      }
    }
  }

  async disconnect() {
    // Clients are managed by the pool, no individual disconnect needed
    // Use TelegramSessionPool.cleanup() for full cleanup if needed
  }
}

// Cleanup session pool on process exit
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down Telegram session pool...');
  await TelegramSessionPool.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down Telegram session pool...');
  await TelegramSessionPool.cleanup();
  process.exit(0);
});

module.exports = TelegramChannelFetcher;
