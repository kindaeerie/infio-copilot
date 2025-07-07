import { SerializedChatMessage } from '../../../types/chat'

export const CHAT_SCHEMA_VERSION = 2

export type ChatConversation = {
  id: string
  title: string
  messages: SerializedChatMessage[]
  createdAt: number
  updatedAt: number
  schemaVersion: number
  workspace?: string // 工作区ID，可选字段用于向后兼容
}

export type ChatConversationMetadata = {
  id: string
  title: string
  updatedAt: number
  schemaVersion: number
  workspace?: string // 工作区ID，可选字段用于向后兼容
}
