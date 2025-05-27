const {
  comparePassword,
  deleteUserById,
  generateToken,
  getUserById,
  updateUser,
  createUser,
  countUsers,
  findUser,
} = require('./userMethods');
const {
  findFileById,
  createFile,
  updateFile,
  deleteFile,
  deleteFiles,
  getFiles,
  updateFileUsage,
} = require('./File');
const {
  getMessage,
  getMessages,
  saveMessage,
  recordMessage,
  updateMessage,
  deleteMessagesSince,
  deleteMessages,
} = require('./Message');
const {
  createSession,
  findSession,
  updateExpiration,
  deleteSession,
  deleteAllUserSessions,
  generateRefreshToken,
  countActiveSessions,
} = require('./Session');
const { getConvoTitle, getConvo, saveConvo, deleteConvos } = require('./Conversation');
const { getPreset, getPresets, savePreset, deletePresets } = require('./Preset');
const { createToken, findToken, updateToken, deleteTokens } = require('./Token');
const {
  createSchedulerTask,
  getSchedulerTaskById,
  getSchedulerTasksByUser,
  getReadySchedulerTasks,
  updateSchedulerTask,
  deleteSchedulerTask,
  deleteSchedulerTasksByUser,
  enableSchedulerTask,
  disableSchedulerTask,
} = require('./SchedulerTask');
const {
  createSchedulerExecution,
  getSchedulerExecutionById,
  getSchedulerExecutionsByTask,
  getSchedulerExecutionsByUser,
  updateSchedulerExecution,
  deleteSchedulerExecutionsByTask,
  deleteSchedulerExecutionsByUser,
  getRunningSchedulerExecutions,
  cleanupOldSchedulerExecutions,
} = require('./SchedulerExecution');
const Balance = require('./Balance');
const User = require('./User');
const Key = require('./Key');
const UserIntegration = require('./UserIntegration');
const AvailableIntegration = require('./AvailableIntegration');

module.exports = {
  comparePassword,
  deleteUserById,
  generateToken,
  getUserById,
  updateUser,
  createUser,
  countUsers,
  findUser,

  findFileById,
  createFile,
  updateFile,
  deleteFile,
  deleteFiles,
  getFiles,
  updateFileUsage,

  getMessage,
  getMessages,
  saveMessage,
  recordMessage,
  updateMessage,
  deleteMessagesSince,
  deleteMessages,

  getConvoTitle,
  getConvo,
  saveConvo,
  deleteConvos,

  getPreset,
  getPresets,
  savePreset,
  deletePresets,

  createToken,
  findToken,
  updateToken,
  deleteTokens,

  createSession,
  findSession,
  updateExpiration,
  deleteSession,
  deleteAllUserSessions,
  generateRefreshToken,
  countActiveSessions,

  // Scheduler models
  createSchedulerTask,
  getSchedulerTaskById,
  getSchedulerTasksByUser,
  getReadySchedulerTasks,
  updateSchedulerTask,
  deleteSchedulerTask,
  deleteSchedulerTasksByUser,
  enableSchedulerTask,
  disableSchedulerTask,

  createSchedulerExecution,
  getSchedulerExecutionById,
  getSchedulerExecutionsByTask,
  getSchedulerExecutionsByUser,
  updateSchedulerExecution,
  deleteSchedulerExecutionsByTask,
  deleteSchedulerExecutionsByUser,
  getRunningSchedulerExecutions,
  cleanupOldSchedulerExecutions,

  User,
  Key,
  Balance,
  UserIntegration,
  AvailableIntegration,
};
