const fs = require('fs').promises;
const express = require('express');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { resizeAvatar } = require('~/server/services/Files/images/avatar');
const { filterFile } = require('~/server/services/Files/process');
const { logger } = require('~/config');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    filterFile({ req, file: req.file, image: true, isAvatar: true });
    const userId = req.user.id;
    const { manual } = req.body;
    const input = await fs.readFile(req.file.path);

    if (!userId) {
      throw new Error('User ID is undefined');
    }

    const fileStrategy = req.app.locals.fileStrategy;
    const desiredFormat = req.app.locals.imageOutputType;

    // Add detailed logging for debugging
    logger.info(`[Avatar Upload] Starting upload for user: ${userId}`);
    logger.info(`[Avatar Upload] File strategy: ${fileStrategy}`);
    logger.info(`[Avatar Upload] Manual upload: ${manual}`);
    logger.info(`[Avatar Upload] Original file path: ${req.file.path}`);
    logger.info(`[Avatar Upload] Original file size: ${req.file.size} bytes`);

    const resizedBuffer = await resizeAvatar({
      userId,
      input,
      desiredFormat,
    });

    logger.info(`[Avatar Upload] Resized buffer size: ${resizedBuffer.length} bytes`);

    const { processAvatar } = getStrategyFunctions(fileStrategy);
    logger.info(
      `[Avatar Upload] Using strategy: ${fileStrategy}, processAvatar function: ${processAvatar?.name || 'unknown'}`,
    );

    const url = await processAvatar({ buffer: resizedBuffer, userId, manual });

    logger.info(`[Avatar Upload] Upload completed. Final URL: ${url}`);

    res.json({ url });
  } catch (error) {
    const message = 'An error occurred while uploading the profile picture';
    logger.error(message, error);
    res.status(500).json({ message });
  } finally {
    try {
      await fs.unlink(req.file.path);
      logger.debug('[/files/images/avatar] Temp. image upload file deleted');
    } catch (error) {
      logger.debug('[/files/images/avatar] Temp. image upload file already deleted');
    }
  }
});

module.exports = router;
