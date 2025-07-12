const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { FileContext } = require('librechat-data-provider');
const { v4: uuidv4 } = require('uuid');

class TelegramChannelFetcher extends Tool {
  name = 'telegram';
  description = 'Fetch messages from public Telegram channels. Use this tool to retrieve recent messages from specified public channels with optional date filtering.';
  
  schema = z.object({
    channel_name: z.string().min(1).describe('The channel username (without @) or channel ID to fetch messages from. For example: "channelname" or "1234567890"'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe('Maximum number of messages to fetch. When date filtering is used, defaults to 500 (all messages in range). For recent messages without date filtering, defaults to 10. Maximum 500.'),
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
      .describe('Whether to download and save images to files. Images will be saved using the configured file strategy (local, Firebase, S3, Azure Blob). Defaults to false to reduce latency.'),
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
      throw new Error(
        `Missing ${this.envVarApiId} or ${this.envVarApiHash} environment variable.`,
      );
    }

    // Validate session string is provided
    if (!this.override && !getEnvironmentVariable('TELEGRAM_SESSION_STRING')) {
      throw new Error(
        'Missing TELEGRAM_SESSION_STRING environment variable. Please add your Telegram session string to the .env file.',
      );
    }

    this.client = null;
  }

  async initializeClient() {
    if (this.client) {
      return this.client;
    }

    try {
      // Load session from environment variable
      const sessionString = getEnvironmentVariable('TELEGRAM_SESSION_STRING') || '';
      
      if (!sessionString) {
        throw new Error('TELEGRAM_SESSION_STRING environment variable is required. Please add your Telegram session string to the .env file.');
      }
      
      const session = new StringSession(sessionString);
      console.log('Using Telegram session from environment variable');

      this.client = new TelegramClient(session, parseInt(this.apiId), this.apiHash, {
        connectionRetries: 5,
      });

      await this.client.start({
        phoneNumber: () => {
          throw new Error('Interactive authentication not supported. Please provide a valid session file.');
        },
        password: () => {
          throw new Error('Interactive authentication not supported. Please provide a valid session file.');
        },
        phoneCode: () => {
          throw new Error('Interactive authentication not supported. Please provide a valid session file.');
        },
        onError: (err) => {
          console.error('Telegram auth error:', err);
        },
      });

      // Session is already loaded from environment variable, no need to save

      return this.client;
    } catch (error) {
      console.error('Failed to initialize Telegram client:', error);
      throw new Error(`Failed to initialize Telegram client: ${error.message}. Note: You need to authenticate this client once manually to create a session file.`);
    }
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

    const { channel_name, limit, offset_date, min_date, max_date, include_images = false } = validationResult.data;
    
    // Smart pagination logic: when date filtering is used, fetch all messages in range
    const isDateFiltered = min_date || max_date || offset_date;
    const effectiveLimit = limit || (isDateFiltered ? 500 : 10);

    try {
      const client = await this.initializeClient();

      // Parse date filters and convert to Unix timestamps for GramJS
      const offsetDate = offset_date ? Math.floor(this.parseDate(offset_date).getTime() / 1000) : undefined;
      const minDate = min_date ? this.parseDate(min_date) : null;
      const maxDate = max_date ? this.parseDate(max_date) : null;

      // Validate date range
      if (offsetDate && minDate && new Date(offsetDate * 1000) <= minDate) {
        throw new Error('offset_date must be after min_date');
      }
      if (minDate && maxDate && minDate >= maxDate) {
        throw new Error('min_date must be before max_date');
      }
      
      // If max_date is provided but no offset_date, use max_date as offset_date for GramJS
      const finalOffsetDate = offsetDate || (maxDate ? Math.floor(maxDate.getTime() / 1000) : undefined);

      // Get the channel entity
      let channel;
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
      } catch (error) {
        throw new Error(`Channel not found or not accessible: ${channel_name}. Make sure it's a public channel.`);
      }

      // Fetch messages with filters
      const messages = [];
      
      for await (const message of client.iterMessages(channel, {
        limit: effectiveLimit,
        offsetDate: finalOffsetDate,
        reverse: false, // Get newest first
      })) {
        // Convert message datetime to Date object for comparison
        const messageDateTime = message.date instanceof Date ? message.date : new Date(message.date * 1000);
        
        // Apply min_date filter manually since GramJS doesn't have this built-in
        if (minDate && messageDateTime < minDate) {
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

        // Extract entities (links, mentions, cashtags, etc.)
        const entities = [];
        if (message.entities) {
          for (const entity of message.entities) {
            const entityData = {
              type: entity.className.replace('MessageEntity', '').toLowerCase(),
              offset: entity.offset,
              length: entity.length,
              text: message.message.substring(entity.offset, entity.offset + entity.length)
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
            has_spoiler: message.media.spoiler || false
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
                        imageOutputType: 'jpeg'
                      }
                    },
                    file: {
                      originalname: imageName
                    }
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
                      height: null
                    },
                    resize: false // Don't resize, keep original
                  });
                  
                  mediaInfo.image_url = result.filepath;
                  mediaInfo.image_file_id = result.file_id;
                  mediaInfo.image_size = imageBuffer.length;
                  mediaInfo.image_format = 'jpeg'; // Telegram photos are usually JPEG
                  console.log(`Downloaded and saved image for message ${message.id}, size: ${imageBuffer.length} bytes, path: ${result.filepath}`);
                }
              } catch (downloadError) {
                console.error(`Failed to download image for message ${message.id}:`, downloadError);
                mediaInfo.download_error = downloadError.message;
              }
            }
          }
          
          // Add TTL if present
          if (message.media.ttlSeconds) {
            mediaInfo.ttl_seconds = message.media.ttlSeconds;
          }
        }

        const messageData = {
          id: message.id,
          text: message.message || '',
          date: dateString,
          sender_id: message.senderId,
          views: message.views || 0,
          forwards: message.forwards || 0,
          replies: message.replies ? message.replies.replies : 0,
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

        messages.push(messageData);
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
        filters_applied: {
          limit: effectiveLimit,
          offset_date: offset_date || null,
          min_date: min_date || null,
          max_date: max_date || null,
          include_images: include_images,
          smart_pagination: isDateFiltered,
        },
      };


      return JSON.stringify(result, null, 2);

    } catch (error) {
      console.error('Telegram fetch error:', error);
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
  }
}

module.exports = TelegramChannelFetcher;