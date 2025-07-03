import { App } from 'obsidian'
import { v4 as uuidv4 } from 'uuid'

import { ChatConversationMeta } from '../../../types/chat'
import { AbstractJsonRepository } from '../base'
import { CHAT_DIR, ROOT_DIR } from '../constants'
import { EmptyChatTitleException } from '../exception'

import {
	CHAT_SCHEMA_VERSION,
	ChatConversation
} from './types'


export class ChatManager extends AbstractJsonRepository<
	ChatConversation,
	ChatConversationMeta
> {
	constructor(app: App) {
		super(app, `${ROOT_DIR}/${CHAT_DIR}`)
	}

	protected generateFileName(chat: ChatConversation): string {
		// Format: v{schemaVersion}_{title}_{updatedAt}_{id}.json
		const encodedTitle = encodeURIComponent(chat.title)
		return `v${chat.schemaVersion}_${encodedTitle}_${chat.updatedAt}_${chat.id}.json`
	}

	protected parseFileName(fileName: string): ChatConversationMeta | null {
		// Parse: v{schemaVersion}_{title}_{updatedAt}_{id}.json
		const regex = new RegExp(
			`^v${CHAT_SCHEMA_VERSION}_(.+)_(\\d+)_([0-9a-f-]+)\\.json$`,
		)
		const match = fileName.match(regex)
		if (!match) return null

		const title = decodeURIComponent(match[1])
		const updatedAt = parseInt(match[2], 10)
		const id = match[3]

		return {
			id,
			schemaVersion: CHAT_SCHEMA_VERSION,
			title,
			updatedAt,
			createdAt: 0,
		}
	}

	public async createChat(
		initialData: Partial<ChatConversation>,
	): Promise<ChatConversation> {
		if (initialData.title && initialData.title.length === 0) {
			throw new EmptyChatTitleException()
		}

		const now = Date.now()
		const newChat: ChatConversation = {
			id: uuidv4(),
			title: 'New chat',
			messages: [],
			createdAt: now,
			updatedAt: now,
			schemaVersion: CHAT_SCHEMA_VERSION,
			...initialData,
		}

		await this.create(newChat)
		return newChat
	}

	public async findById(id: string): Promise<ChatConversation | null> {
		const allMetadata = await this.listMetadata()
		const targetMetadatas = allMetadata.filter((meta) => meta.id === id)

		if (targetMetadatas.length === 0) return null

		// Sort by updatedAt descending to find the latest version
		targetMetadatas.sort((a, b) => b.updatedAt - a.updatedAt)
		const latestMetadata = targetMetadatas[0]

		return this.read(latestMetadata.fileName)
	}

	public async updateChat(
		id: string,
		updates: Partial<
			Omit<ChatConversation, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>
		>,
	): Promise<ChatConversation | null> {
		const chat = await this.findById(id)
		if (!chat) return null

		if (updates.title !== undefined && updates.title.length === 0) {
			throw new EmptyChatTitleException()
		}

		const updatedChat: ChatConversation = {
			...chat,
			...updates,
			updatedAt: Date.now(),
		}

		await this.update(chat, updatedChat)
		return updatedChat
	}

	public async deleteChat(id: string): Promise<boolean> {
		const allMetadata = await this.listMetadata()
		const targetsToDelete = allMetadata.filter((meta) => meta.id === id)

		if (targetsToDelete.length === 0) return false

		// Delete all files associated with this ID
		await Promise.all(targetsToDelete.map(meta => this.delete(meta.fileName)))

		return true
	}

	public async cleanupOutdatedChats(): Promise<number> {
		const allMetadata = await this.listMetadata()
		const chatsById = new Map<string, (ChatConversationMeta & { fileName: string })[]>()

		// Group chats by ID
		for (const meta of allMetadata) {
			if (!chatsById.has(meta.id)) {
				chatsById.set(meta.id, [])
			}
			chatsById.get(meta.id)!.push(meta)
		}

		const filesToDelete: string[] = []

		// Find outdated files for each ID
		for (const chatGroup of chatsById.values()) {
			if (chatGroup.length > 1) {
				// Sort by date to find the newest
				chatGroup.sort((a, b) => b.updatedAt - a.updatedAt)
				// The first one is the latest, the rest are outdated
				const outdatedFiles = chatGroup.slice(1)
				for (const outdated of outdatedFiles) {
					filesToDelete.push(outdated.fileName)
				}
			}
		}

		if (filesToDelete.length > 0) {
			await Promise.all(filesToDelete.map(fileName => this.delete(fileName)))
		}

		return filesToDelete.length
	}

	public async listChats(): Promise<ChatConversationMeta[]> {
		const metadata = await this.listMetadata()

		// Use a Map to store the latest version of each chat by ID.
		const latestChats = new Map<string, ChatConversationMeta>()

		for (const meta of metadata) {
			const existing = latestChats.get(meta.id)
			if (!existing || meta.updatedAt > existing.updatedAt) {
				latestChats.set(meta.id, meta)
			}
		}

		const uniqueMetadata = Array.from(latestChats.values())
		const sorted = uniqueMetadata.sort((a, b) => b.updatedAt - a.updatedAt)
		return sorted
	}
}
