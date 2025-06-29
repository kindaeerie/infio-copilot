// @ts-expect-error
import { type PGliteWithLive } from '@electric-sql/pglite/live'
import { App } from 'obsidian'

import { createAndInitDb } from '../pgworker'

import { CommandManager } from './modules/command/command-manager'
import { ConversationManager } from './modules/conversation/conversation-manager'
import { InsightManager } from './modules/insight/insight-manager'
import { VectorManager } from './modules/vector/vector-manager'

export class DBManager {
	private app: App
	private db: PGliteWithLive | null = null
	private vectorManager: VectorManager
	private CommandManager: CommandManager
	private conversationManager: ConversationManager
	private insightManager: InsightManager

	constructor(app: App) {
		this.app = app
	}

	static async create(app: App): Promise<DBManager> {
		const dbManager = new DBManager(app)
		dbManager.db = await createAndInitDb()

		dbManager.vectorManager = new VectorManager(app, dbManager)
		dbManager.CommandManager = new CommandManager(app, dbManager)
		dbManager.conversationManager = new ConversationManager(app, dbManager)
		dbManager.insightManager = new InsightManager(app, dbManager)

		return dbManager
	}

	getPgClient(): PGliteWithLive | null {
		return this.db
	}

	getVectorManager(): VectorManager {
		return this.vectorManager
	}

	getCommandManager(): CommandManager {
		return this.CommandManager
	}

	getConversationManager(): ConversationManager {
		return this.conversationManager
	}

	getInsightManager(): InsightManager {
		return this.insightManager
	}

	async cleanup() {
		this.db?.close()
		this.db = null
	}
}
