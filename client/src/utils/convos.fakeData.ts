// @ts-nocheck
import { EModelEndpoint, ImageDetail } from 'librechat-data-provider';
import type { ConversationData } from 'librechat-data-provider';

const today = new Date();
today.setDate(today.getDate() - 3);
const updatedAt = today.toISOString();

export const convoData: ConversationData = {
  pages: [
    {
      conversations: [
        {
          conversationId: 'bf71b257-3625-440c-b6a6-03f6a3fd6a4d',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-02T15:28:47.123Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: [
            '65bd0a2f7cb605e374e93ea3',
            '65bd0a2f7cb605e374e94028',
            '65bec4af7cb605e3741e84d1',
            '65bec4af7cb605e3741e86aa',
          ],
          model: 'gpt-3.5-turbo-0125',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'A Long Story',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: '544f1c4f-030f-4ea2-997c-35923f5d8ee2',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T22:48:33.144Z',
          endpoint: 'OpenRouter',
          endpointType: EModelEndpoint.custom,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: [
            '65bec2c27cb605e3741896fd',
            '65bec2c47cb605e374189c16',
            '65bec2d97cb605e37418d7dc',
            '65bec2e67cb605e374190490',
            '65bec2e77cb605e3741907df',
          ],
          model: 'meta-llama/llama-2-13b-chat',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'How Are You Doing?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: 'e3f19866-190e-43ab-869f-10260f07530f',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T18:55:09.560Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65be8c0d7cb605e37473236c', '65be8c0d7cb605e374732475'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'A Long Story',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: '4d569723-3aff-4f52-9bbf-e127783a06ac',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T16:37:37.600Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: [
            '65be6bd17cb605e374127036',
            '65be6bd17cb605e374127156',
            '65be8c007cb605e37472f7a9',
            '65be8c007cb605e37472f8b5',
            '65be8c057cb605e374730c05',
            '65be8c067cb605e374730dae',
          ],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: "Write Einstein's Famous Equation in LaTeX",
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: '640db89d-459f-4411-a0b0-26cb1d53bf1a',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T16:36:11.010Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: [
            '65be6b7a7cb605e374117519',
            '65be6b7b7cb605e37411766c',
            '65be6e1c7cb605e374195898',
            '65be6e1d7cb605e374195985',
            '65be6e767cb605e3741a5d94',
            '65be6e767cb605e3741a5e8e',
            '65be89ee7cb605e3746ccb52',
          ],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Fibonacci Solver in Python',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: 'a9b39a05-fdc0-47f4-bd3b-b0aca618f656',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T07:06:55.573Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: [
            '65bde6117cb605e37481d294',
            '65bde6117cb605e37481d4eb',
            '65be6e7b7cb605e3741a6dd4',
            '65be6e7b7cb605e3741a6ebe',
            '65be6fa97cb605e3741df0ed',
            '65be6fa97cb605e3741df249',
            '65be709a7cb605e37420ca1b',
            '65be709a7cb605e37420cb24',
            '65be71ba7cb605e374244131',
            '65be71bb7cb605e37424423e',
            '65be79017cb605e37439dddd',
            '65be79027cb605e37439df49',
            '65be82e57cb605e37457d6b5',
            '65be84727cb605e3745c76ff',
          ],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'test',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: '3ce779d7-8535-4a43-9b70-e0d3160f299e',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-02T16:41:24.324Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: [
            '65bd1b347cb605e3741e299d',
            '65bd1b347cb605e3741e2ba6',
            '65be82ed7cb605e37457f381',
          ],
          model: 'gpt-3.5-turbo-0125',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How can I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: 'c162f906-06fb-405a-b7e6-773a0fc5f8e9',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T06:01:57.968Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: [
            '65bdd6d77cb605e37454b66c',
            '65bdd6d87cb605e37454b892',
            '65bddca57cb605e37465ceea',
            '65bddcab7cb605e37465de2b',
            '65bddccb7cb605e374663d37',
            '65bddccc7cb605e374663ea9',
            '65bddce17cb605e374667f08',
            '65bddce27cb605e374668096',
            '65bdeb557cb605e37491787a',
            '65bdeb567cb605e374917aa2',
            '65be82dc7cb605e37457b70e',
          ],
          model: 'gpt-4-0125-preview',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'test',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: '48bbc7d5-1815-4024-8ac6-6c9f59242426',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T18:15:36.759Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: [
            '65be82c87cb605e3745777f6',
            '65be82c97cb605e374577911',
            '65be82d57cb605e37457a2fc',
          ],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How can I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: '97d6e676-b05b-43f9-8f56-1c07e8a1eb4e',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T07:16:36.407Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: [
            '65bde8557cb605e37488abe2',
            '65bde8567cb605e37488ad32',
            '65be6eb97cb605e3741b267b',
            '65be6eba7cb605e3741b2849',
            '65be703c7cb605e3741fb06d',
            '65be703d7cb605e3741fb182',
            '65be710b7cb605e374221776',
            '65be710b7cb605e37422193a',
            '65be72137cb605e37425544c',
            '65be72137cb605e37425556c',
            '65be7e2c7cb605e3744975ee',
            '65be7e6c7cb605e3744a3d29',
            '65be81147cb605e374525ccb',
            '65be826b7cb605e374565dcf',
            '65be827e7cb605e37456986c',
            '65be82967cb605e37456db94',
            '65be82c07cb605e374575ef6',
          ],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'test',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: '293f230b-ceaa-4802-9611-c4fe7e4b1fd6',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T07:20:58.933Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: [
            '65bde95c7cb605e3748ba84d',
            '65bde95c7cb605e3748baa9d',
            '65be6b3a7cb605e37410ab2d',
            '65be6b3a7cb605e37410ac16',
          ],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello, How Can I Help You?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: '279db3ad-2219-4229-b99a-e19a2b191dd7',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T16:32:22.480Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65be6a967cb605e3740ebd60', '65be6a967cb605e3740ebf38'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello there! How may I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: '3e62a081-055c-4ee5-9e33-7ab8b3d367c9',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T07:26:10.988Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65bdea947cb605e3748f4275', '65bdea947cb605e3748f43af'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How may I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: 'b97836fc-8566-48e2-a28d-99f99528ca20',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T07:18:01.245Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65bde8aa7cb605e37489a256', '65bde8ab7cb605e37489a3a1'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How can I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: 'aa52b79d-ebe7-49d1-9fee-5f5b89d56069',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T07:16:03.728Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65bde8357cb605e37488508e', '65bde8357cb605e37488520e'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How may I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: 'fe50b20f-8465-4866-b5ef-9bc519a00eef',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T07:13:10.682Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65bde7887cb605e3748644e0', '65bde7887cb605e37486463b'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How can I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: '2fbb4a34-4d17-4e05-8c0a-949e78572aa3',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T07:10:42.904Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65bde6f47cb605e374848207', '65bde6f47cb605e3748483b5'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How can I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: 'c0d587d0-e881-42be-a2cf-5bf01198bdac',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T07:09:25.506Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65bde6a77cb605e3748393d7', '65bde6a77cb605e374839506'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How can I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: 'acd7fa14-4165-4fa1-b2a6-637041743a78',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T07:08:10.607Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65bde65c7cb605e37482b6f7', '65bde65c7cb605e37482b822'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How can I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: '61ba520e-d53b-4816-b8cc-059d89f15ed4',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T07:07:49.166Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65bde6467cb605e374826fee', '65bde6477cb605e374827125'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How can I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: 'd4f599af-aeae-4a54-b34c-bd85ce8134af',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T06:59:49.834Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65bde4677cb605e3747cd0ed', '65bde4677cb605e3747cd26d'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How can I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: 'e424c98c-8540-428a-ae43-dc314e15849d',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T06:40:18.167Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65bddfd37cb605e3746f42c5', '65bddfd47cb605e3746f4471'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How can I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: 'edac9c4d-bb66-4550-acaf-98006b83db4d',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T06:35:35.937Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: ['65bddeb97cb605e3746bfb5e', '65bddeb97cb605e3746bfc8a'],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hello! How can I assist you today?',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: 'dbeca051-8af8-42cb-a611-70f669c66502',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T06:00:31.691Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: [
            '65bdd6817cb605e37453b904',
            '65bdd6817cb605e37453ba9b',
            '65bddd7e7cb605e3746858ff',
            '65bddd7f7cb605e374685ac6',
          ],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'test 2',
          top_p: 1,
          updatedAt,
        },
        {
          conversationId: '4a69c491-5cfc-4a62-b7d3-6a54d890dfa8',
          user: 'my-user-id',
          chatGptLabel: null,
          createdAt: '2024-02-03T06:14:02.394Z',
          endpoint: EModelEndpoint.openAI,
          frequency_penalty: 0,
          imageDetail: ImageDetail.auto,
          messages: [
            '65bdd9ab7cb605e3745cf30b',
            '65bdd9ac7cb605e3745cf3f6',
            '65bddc417cb605e37464abc7',
            '65bddc427cb605e37464ad09',
            '65bddc4a7cb605e37464c7cc',
            '65bddc767cb605e374654895',
          ],
          model: 'gpt-3.5-turbo-0301',
          presence_penalty: 0,
          promptPrefix: null,
          resendFiles: false,
          temperature: 1,
          title: 'Hi there! How can I assist you today?',
          top_p: 1,
          updatedAt,
        },
      ],
      pages: 49,
      pageNumber: '1',
      pageSize: 25,
    },
  ],
  pageParams: [null],
};
