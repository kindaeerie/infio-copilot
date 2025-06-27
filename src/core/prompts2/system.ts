
import * as path from 'path'

import { App, normalizePath } from 'obsidian'

import { FilesSearchSettings } from "../../types/settings"
import {
	CustomModePrompts,
	Mode,
	ModeConfig,
	PromptComponent,
	defaultModeSlug,
	defaultModes,
	getGroupName,
	getModeBySlug
} from "../../utils/modes"
import { DiffStrategy } from "../diff/DiffStrategy"
import { McpHub } from "../mcp/McpHub"

import { ROOT_DIR } from './constants'
import {
	addCustomInstructions,
	getCapabilitiesSection,
	getMcpServersSection,
	getModesSection,
	getObjectiveSection,
	getRulesSection,
	getSharedToolUseSection,
	getSystemInfoSection,
	getToolUseGuidelinesSection,
} from "./sections"
// import { loadSystemPromptFile } from "./sections/custom-system-prompt"
import { getToolDescriptionsForMode } from "./tools"


export class SystemPrompt {
	protected dataDir: string
	protected app: App

	constructor(app: App) {
		this.app = app
		this.dataDir = normalizePath(`${ROOT_DIR}`)
		this.ensureDirectory()
	}

	private async ensureDirectory(): Promise<void> {
		if (!(await this.app.vault.adapter.exists(this.dataDir))) {
			await this.app.vault.adapter.mkdir(this.dataDir)
		}
	}

	private getSystemPromptFilePath(mode: Mode): string {
		// Format: {mode slug}_system_prompt.md
		return `${mode}/system_prompt.md`
	}

	private async loadSystemPromptFile(mode: Mode): Promise<string> {
		const fileName = this.getSystemPromptFilePath(mode)
		const filePath = normalizePath(path.join(this.dataDir, fileName))
		if (!(await this.app.vault.adapter.exists(filePath))) {
			return ""
		}
		const content = await this.app.vault.adapter.read(filePath)
		return content
	}

	private async generatePrompt(
		cwd: string,
		supportsComputerUse: boolean,
		mode: Mode,
		searchSettings: FilesSearchSettings,
		filesSearchMethod: string,
		mcpHub?: McpHub,
		diffStrategy?: DiffStrategy,
		browserViewportSize?: string,
		promptComponent?: PromptComponent,
		customModeConfigs?: ModeConfig[],
		globalCustomInstructions?: string,
		preferredLanguage?: string,
		diffEnabled?: boolean,
		experiments?: Record<string, boolean>,
		enableMcpServerCreation?: boolean,
	): Promise<string> {
		// if (!context) {
		// 	throw new Error("Extension context is required for generating system prompt")
		// }

		// // If diff is disabled, don't pass the diffStrategy
		// const effectiveDiffStrategy = diffEnabled ? diffStrategy : undefined

		// Get the full mode config to ensure we have the role definition
		const modeConfig = getModeBySlug(mode, customModeConfigs) || defaultModes.find((m) => m.slug === mode) || defaultModes[0]
		// const roleDefinition = promptComponent?.roleDefinition || modeConfig.roleDefinition

		// const [modesSection, mcpServersSection] = await Promise.all([
		// 	getModesSection(),
		// 	modeConfig.groups.some((groupEntry) => getGroupName(groupEntry) === "mcp")
		// 		? getMcpServersSection(mcpHub, diffStrategy, enableMcpServerCreation)
		// 		: Promise.resolve(""),
		// ])

		const baseToolDefinitions = `You are Infio, a versatile AI assistant integrated into a note-taking application. Your purpose is to help users manage, query, and create content within their knowledge base.

You operate by thinking step-by-step and using a set of available tools to accomplish tasks.

==== TOOL DEFINITIONS ====

# Tool Use Formatting
Tool use is formatted using XML-style tags. You can only use one tool per message and must wait for the user's response before proceeding.

<tool_name>
  <parameter1_name>value1</parameter1_name>
</tool_name>`

		const baseRules = `==== UNIVERSAL RULES ====

1.  **Think First**: Before acting, always use <thinking> tags to outline your plan, assess what you know, and decide which tool to use.
2.  **One Step at a Time**: Execute one tool per message. Never assume a tool's success.
3.  **Wait for Confirmation**: After every tool use, you MUST wait for the user's response which will contain the result. Use this result to inform your next step.
4.  **Be Direct**: Do not use conversational filler like "Great," "Certainly," or "Okay." Be direct and technical.
5.  **Final Answer**: When the task is complete, use the <attempt_completion> tool. The result should be final and not end with a question.
6.  **Questioning**: Only use <ask_followup_question> when critical information is missing and cannot be found using your tools.
		`

		const basePrompt = `${baseToolDefinitions}

${getToolDescriptionsForMode(
			mode,
			cwd,
			searchSettings,
			filesSearchMethod,
			supportsComputerUse,
			diffStrategy,
			browserViewportSize,
			mcpHub,
			customModeConfigs,
			experiments,
		)}

${baseRules}

${await addCustomInstructions(this.app, promptComponent?.customInstructions || modeConfig.customInstructions || "", globalCustomInstructions || "", cwd, mode, { preferredLanguage })}`

		return basePrompt
	}

	public async getSystemPrompt(
		cwd: string,
		supportsComputerUse: boolean,
		mode: Mode = defaultModeSlug,
		searchSettings: FilesSearchSettings,
		filesSearchMethod: string = 'regex',
		preferredLanguage?: string,
		diffStrategy?: DiffStrategy,
		customModePrompts?: CustomModePrompts,
		customModes?: ModeConfig[],
		mcpHub?: McpHub,
		browserViewportSize?: string,
		globalCustomInstructions?: string,
		diffEnabled?: boolean,
		experiments?: Record<string, boolean>,
		enableMcpServerCreation?: boolean,
	): Promise<string> {

		const getPromptComponent = (value: unknown): PromptComponent | undefined => {
			if (typeof value === "object" && value !== null) {
				return value as PromptComponent
			}
			return undefined
		}

		// Try to load custom system prompt from file
		const fileCustomSystemPrompt = await this.loadSystemPromptFile(mode)

		// Check if it's a custom mode
		const promptComponent = getPromptComponent(customModePrompts?.[mode])

		// Get full mode config from custom modes or fall back to built-in modes
		const currentMode = getModeBySlug(mode, customModes) || defaultModes.find((m) => m.slug === mode) || defaultModes[0]

		// If a file-based custom system prompt exists, use it
		if (fileCustomSystemPrompt) {
			const roleDefinition = promptComponent?.roleDefinition || currentMode.roleDefinition
			const customInstructions = await addCustomInstructions(
				this.app,
				promptComponent?.customInstructions || currentMode.customInstructions || "",
				globalCustomInstructions || "",
				cwd,
				mode,
				{ preferredLanguage },
			)
			return `${roleDefinition}

${fileCustomSystemPrompt}

${customInstructions}`
		}

		// // If diff is disabled, don't pass the diffStrategy
		// const effectiveDiffStrategy = diffEnabled ? diffStrategy : undefined

		return this.generatePrompt(
			// context,
			cwd,
			supportsComputerUse,
			currentMode.slug,
			searchSettings,
			filesSearchMethod,
			mcpHub,
			diffStrategy,
			browserViewportSize,
			promptComponent,
			customModes,
			globalCustomInstructions,
			preferredLanguage,
			diffEnabled,
			experiments,
			enableMcpServerCreation,
		)
	}
}
