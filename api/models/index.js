const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const methods = createMethods(mongoose);
const { comparePassword } = require('./userMethods');
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
const AppComponents = require('./AppComponents');

module.exports = {
  ...methods,
  comparePassword,
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
  AppComponents,
};
