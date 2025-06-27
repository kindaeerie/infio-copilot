export const WORKSPACE_SCHEMA_VERSION = 1

export interface WorkspaceContent {
  type: 'tag' | 'folder'
  content: string
}

export interface WorkspaceChatHistory {
  id: string
  title: string
}

export interface Workspace {
  id: string
  name: string
  content: WorkspaceContent[]
  chatHistory: WorkspaceChatHistory[]
  metadata: Record<string, any>
  createdAt: number
  updatedAt: number
  schemaVersion: number
}

export interface WorkspaceMetadata {
  id: string
  name: string
  updatedAt: number
  createdAt: number
  schemaVersion: number
} 
