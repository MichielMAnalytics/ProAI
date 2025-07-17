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
const UserIntegration = require('./UserIntegration');
const AvailableIntegration = require('./AvailableIntegration');
const AppComponents = require('./AppComponents');
const {
  TriggerDeployment,
  createTriggerDeployment,
  getTriggerDeploymentByWorkflow,
  getTriggerDeploymentsByUser,
  updateTriggerDeployment,
  updateTriggerDeploymentStatus,
  deleteTriggerDeployment,
  deleteTriggerDeploymentsByUser,
  getActiveTriggerDeployments,
} = require('./TriggerDeployment');

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

  UserIntegration,
  AvailableIntegration,
  AppComponents,
  
  // Trigger deployment models
  TriggerDeployment,
  createTriggerDeployment,
  getTriggerDeploymentByWorkflow,
  getTriggerDeploymentsByUser,
  updateTriggerDeployment,
  updateTriggerDeploymentStatus,
  deleteTriggerDeployment,
  deleteTriggerDeploymentsByUser,
  getActiveTriggerDeployments,
};
