import { Result, err, ok } from "neverthrow";
import { App, TFolder, getLanguage } from 'obsidian';

import { DBManager } from '../../database/database-manager';
import { InsightManager } from '../../database/modules/insight/insight-manager';
import { EmbeddingModel } from '../../types/embedding';
import { LLMModel } from '../../types/llm/model';
import { RequestMessage } from '../../types/llm/request';
import { InfioSettings } from '../../types/settings';
import { readTFileContentPdf } from '../../utils/obsidian';
import { getFullLanguageName } from '../../utils/prompt-generator';
import { tokenCount } from '../../utils/token';
import LLMManager from '../llm/manager';
import { ANALYZE_PAPER_DESCRIPTION, ANALYZE_PAPER_PROMPT } from '../prompts/transformations/analyze-paper';
import { DENSE_SUMMARY_DESCRIPTION, DENSE_SUMMARY_PROMPT } from '../prompts/transformations/dense-summary';
import { HIERARCHICAL_SUMMARY_DESCRIPTION, HIERARCHICAL_SUMMARY_PROMPT } from '../prompts/transformations/hierarchical-summary';
import { KEY_INSIGHTS_DESCRIPTION, KEY_INSIGHTS_PROMPT } from '../prompts/transformations/key-insights';
import { REFLECTIONS_DESCRIPTION, REFLECTIONS_PROMPT } from '../prompts/transformations/reflections';
import { SIMPLE_SUMMARY_DESCRIPTION, SIMPLE_SUMMARY_PROMPT } from '../prompts/transformations/simple-summary';
import { TABLE_OF_CONTENTS_DESCRIPTION, TABLE_OF_CONTENTS_PROMPT } from '../prompts/transformations/table-of-contents';
import { getEmbeddingModel } from '../rag/embedding';

/**
 * 并发控制工具类
 */
class ConcurrencyLimiter {
	private maxConcurrency: number;
	private currentRunning: number = 0;
	private queue: Array<() => Promise<void>> = [];

	constructor(maxConcurrency: number = 3) {
		this.maxConcurrency = maxConcurrency;
	}

	async execute<T>(task: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			const wrappedTask = async () => {
				try {
					this.currentRunning++;
					const result = await task();
					resolve(result);
				} catch (error) {
					reject(error);
				} finally {
					this.currentRunning--;
					this.processQueue();
				}
			};

			if (this.currentRunning < this.maxConcurrency) {
				wrappedTask();
			} else {
				this.queue.push(wrappedTask);
			}
		});
	}

	private processQueue() {
		if (this.queue.length > 0 && this.currentRunning < this.maxConcurrency) {
			const nextTask = this.queue.shift();
			if (nextTask) {
				nextTask();
			}
		}
	}
}

// 转换类型枚举
export enum TransformationType {
	DENSE_SUMMARY = 'dense_summary',
	HIERARCHICAL_SUMMARY = 'hierarchical_summary',
	ANALYZE_PAPER = 'analyze_paper',
	SIMPLE_SUMMARY = 'simple_summary',
	KEY_INSIGHTS = 'key_insights',
	TABLE_OF_CONTENTS = 'table_of_contents',
	REFLECTIONS = 'reflections'
}

// 转换配置接口
export interface TransformationConfig {
	type: TransformationType;
	prompt: string;
	description: string;
	maxTokens?: number;
}

// 所有可用的转换配置
export const TRANSFORMATIONS: Record<TransformationType, TransformationConfig> = {
	[TransformationType.DENSE_SUMMARY]: {
		type: TransformationType.DENSE_SUMMARY,
		prompt: DENSE_SUMMARY_PROMPT,
		description: DENSE_SUMMARY_DESCRIPTION,
		maxTokens: 4000
	},
	[TransformationType.HIERARCHICAL_SUMMARY]: {
		type: TransformationType.HIERARCHICAL_SUMMARY,
		prompt: HIERARCHICAL_SUMMARY_PROMPT,
		description: HIERARCHICAL_SUMMARY_DESCRIPTION,
		maxTokens: 3000
	},
	[TransformationType.ANALYZE_PAPER]: {
		type: TransformationType.ANALYZE_PAPER,
		prompt: ANALYZE_PAPER_PROMPT,
		description: ANALYZE_PAPER_DESCRIPTION,
		maxTokens: 3000
	},
	[TransformationType.SIMPLE_SUMMARY]: {
		type: TransformationType.SIMPLE_SUMMARY,
		prompt: SIMPLE_SUMMARY_PROMPT,
		description: SIMPLE_SUMMARY_DESCRIPTION,
		maxTokens: 2000
	},
	[TransformationType.KEY_INSIGHTS]: {
		type: TransformationType.KEY_INSIGHTS,
		prompt: KEY_INSIGHTS_PROMPT,
		description: KEY_INSIGHTS_DESCRIPTION,
		maxTokens: 3000
	},
	[TransformationType.TABLE_OF_CONTENTS]: {
		type: TransformationType.TABLE_OF_CONTENTS,
		prompt: TABLE_OF_CONTENTS_PROMPT,
		description: TABLE_OF_CONTENTS_DESCRIPTION,
		maxTokens: 2000
	},
	[TransformationType.REFLECTIONS]: {
		type: TransformationType.REFLECTIONS,
		prompt: REFLECTIONS_PROMPT,
		description: REFLECTIONS_DESCRIPTION,
		maxTokens: 2500
	}
};

// 转换参数接口
export interface TransformationParams {
	filePath: string;  // 文件路径、文件夹路径或工作区标识
	contentType?: 'document' | 'tag' | 'folder' | 'workspace';
	transformationType: TransformationType;
	model?: LLMModel;
	maxContentTokens?: number;
	saveToDatabase?: boolean;
	// 对于 workspace 类型，可以传入额外的元数据
	workspaceMetadata?: {
		name: string;
		description?: string;
		// 完整的 workspace 对象，用于获取配置信息
		workspace?: import('../../database/json/workspace/types').Workspace;
	};
}

// 转换结果接口
export interface TransformationResult {
	success: boolean;
	result?: string;
	error?: string;
	truncated?: boolean;
	originalTokens?: number;
	processedTokens?: number;
}

/**
 * LLM 客户端类，用于与语言模型交互
 */
class TransformationLLMClient {
	private llm: LLMManager;
	private model: LLMModel;

	constructor(llm: LLMManager, model: LLMModel) {
		this.llm = llm;
		this.model = model;
	}

	async queryChatModel(messages: RequestMessage[]): Promise<Result<string, Error>> {
		try {
			const stream = await this.llm.streamResponse(
				this.model,
				{
					messages: messages,
					model: this.model.modelId,
					stream: true,
				}
			);

			let response_content = "";
			for await (const chunk of stream) {
				const content = chunk.choices[0]?.delta?.content ?? '';
				response_content += content;
			}
			return ok(response_content);
		} catch (error) {
			return err(error instanceof Error ? error : new Error(String(error)));
		}
	}
}

/**
 * 文档内容处理类
 */
class DocumentProcessor {
	private static readonly DEFAULT_MAX_TOKENS = 12000; // 默认最大 token 数
	private static readonly MIN_CONTENT_LENGTH = 100; // 最小内容长度（字符数）

	/**
	 * 检查和处理文档内容大小
	 */
	static async processContent(content: string, maxTokens: number = this.DEFAULT_MAX_TOKENS): Promise<{
		processedContent: string;
		truncated: boolean;
		originalTokens: number;
		processedTokens: number;
	}> {
		const originalTokens = await tokenCount(content);

		if (originalTokens <= maxTokens) {
			return {
				processedContent: content,
				truncated: false,
				originalTokens,
				processedTokens: originalTokens
			};
		}

		// 智能截断：基于 token 数量和内容边界
		// 先按字符比例粗略估算截断位置
		const estimatedCharRatio = content.length / originalTokens;
		const estimatedCharLimit = Math.floor(maxTokens * estimatedCharRatio * 0.9); // 留一些缓冲

		let truncatedContent = content.substring(0, estimatedCharLimit);

		// 查找最后一个完整句子的结束位置
		const lastSentenceEnd = Math.max(
			truncatedContent.lastIndexOf('.'),
			truncatedContent.lastIndexOf('!'),
			truncatedContent.lastIndexOf('?'),
			truncatedContent.lastIndexOf('。'),
			truncatedContent.lastIndexOf('！'),
			truncatedContent.lastIndexOf('？')
		);

		// 查找最后一个段落的结束位置
		const lastParagraphEnd = truncatedContent.lastIndexOf('\n\n');

		// 选择最合适的截断位置
		const cutoffPosition = Math.max(lastSentenceEnd, lastParagraphEnd);

		if (cutoffPosition > estimatedCharLimit * 0.8) { // 如果截断位置不会丢失太多内容
			truncatedContent = content.substring(0, cutoffPosition + 1);
		}

		// 确保截断后的内容不会太短
		if (truncatedContent.length < this.MIN_CONTENT_LENGTH) {
			// 按字符比例回退到安全长度
			const safeCharLimit = Math.max(this.MIN_CONTENT_LENGTH, Math.floor(maxTokens * estimatedCharRatio * 0.8));
			truncatedContent = content.substring(0, Math.min(safeCharLimit, content.length));
		}

		// 验证最终的 token 数量
		const finalTokens = await tokenCount(truncatedContent);

		// 如果仍然超过限制，进行更精确的截断
		if (finalTokens > maxTokens) {
			const adjustedRatio = truncatedContent.length / finalTokens;
			const adjustedCharLimit = Math.floor(maxTokens * adjustedRatio);
			truncatedContent = content.substring(0, adjustedCharLimit);
		}

		const processedTokens = await tokenCount(truncatedContent);

		return {
			processedContent: truncatedContent,
			truncated: true,
			originalTokens,
			processedTokens
		};
	}

	/**
	 * 验证内容是否适合处理
	 */
	static validateContent(content: string): Result<void, Error> {
		if (!content || content.trim().length === 0) {
			return err(new Error('内容不能为空'));
		}

		if (content.length < this.MIN_CONTENT_LENGTH) {
			return err(new Error(`内容长度至少需要 ${this.MIN_CONTENT_LENGTH} 个字符`));
		}

		return ok(undefined);
	}
}

/**
 * 转换引擎类
 */
export class TransEngine {
	private app: App;
	private settings: InfioSettings;
	private llmManager: LLMManager;
	private insightManager: InsightManager | null = null;
	private embeddingModel: EmbeddingModel | null = null;

	constructor(
		app: App,
		settings: InfioSettings,
		dbManager: DBManager,
	) {
		this.app = app;
		this.settings = settings;
		this.llmManager = new LLMManager(settings);
		this.insightManager = dbManager.getInsightManager();
		
		// 初始化 embedding model
		if (settings.embeddingModelId && settings.embeddingModelId.trim() !== '') {
			try {
				this.embeddingModel = getEmbeddingModel(settings);
			} catch (error) {
				console.warn('Failed to initialize embedding model:', error);
				this.embeddingModel = null;
			}
		} else {
			this.embeddingModel = null;
		}
	}

	cleanup() {
		this.embeddingModel = null;
		this.insightManager = null;
	}

	setSettings(settings: InfioSettings) {
		this.settings = settings;
		this.llmManager = new LLMManager(settings);
		
		// 重新初始化 embedding model
		if (settings.embeddingModelId && settings.embeddingModelId.trim() !== '') {
			try {
				this.embeddingModel = getEmbeddingModel(settings);
			} catch (error) {
				console.warn('Failed to initialize embedding model:', error);
				this.embeddingModel = null;
			}
		} else {
			this.embeddingModel = null;
		}
	}

	/**
	 * 获取文件元信息的方法
	 */
	private async getFileMetadata(filePath: string): Promise<
		| {
			success: true;
			fileExists: true;
			sourcePath: string;
			sourceMtime: number;
		}
		| {
			success: false;
			error: string;
		}
	> {
		const targetFile = this.app.vault.getFileByPath(filePath);
		if (!targetFile) {
			return {
				success: false,
				error: `文件不存在: ${filePath}`
			};
		}

		return {
			success: true,
			fileExists: true,
			sourcePath: filePath,
			sourceMtime: targetFile.stat.mtime
		};
	}

	/**
	 * 检查数据库缓存的方法
	 */
	private async checkDatabaseCache(
		sourcePath: string,
		sourceMtime: number,
		transformationType: TransformationType
	): Promise<
		| {
			success: true;
			foundCache: true;
			result: TransformationResult;
		}
		| {
			success: true;
			foundCache: false;
		}
	> {
		// 如果没有必要的参数，跳过缓存检查
		if (!this.embeddingModel || !this.insightManager) {
			console.log("no embeddingModel or insightManager");
			return {
				success: true,
				foundCache: false
			};
		}

		try {
			const existingInsights = await this.insightManager.getInsightsBySourcePath(sourcePath, this.embeddingModel);
			console.log("existingInsights", existingInsights);
			
			// 查找匹配的转换类型和修改时间的洞察
			const matchingInsight = existingInsights.find(insight =>
				insight.insight_type === transformationType.toString() &&
				insight.source_mtime === sourceMtime
			);
			
			if (matchingInsight) {
				// 找到匹配的缓存结果，直接返回
				console.log(`使用缓存的转换结果: ${transformationType} for ${sourcePath}`);
				return {
					success: true,
					foundCache: true,
					result: {
						success: true,
						result: matchingInsight.insight,
						truncated: false, // 缓存的结果不涉及截断
						originalTokens: 0, // 缓存结果不需要提供token信息
						processedTokens: 0
					}
				};
			}

			return {
				success: true,
				foundCache: false
			};
		} catch (cacheError) {
			console.warn('查询缓存失败，继续执行转换:', cacheError);
			// 缓存查询失败不影响主流程
			return {
				success: true,
				foundCache: false
			};
		}
	}

	/**
	 * 获取文件内容的方法
	 */
	private async getFileContent(filePath: string): Promise<
		| {
			success: true;
			fileContent: string;
		}
		| {
			success: false;
			error: string;
		}
	> {
		const targetFile = this.app.vault.getFileByPath(filePath);
		if (!targetFile) {
			return {
				success: false,
				error: `文件不存在: ${filePath}`
			};
		}

		try {
			const fileContent = await readTFileContentPdf(targetFile, this.app.vault, this.app);
			return {
				success: true,
				fileContent
			};
		} catch (error) {
			return {
				success: false,
				error: `读取文件失败: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}

	/**
	 * 保存转换结果到数据库的方法
	 */
	private async saveResultToDatabase(
		result: string,
		transformationType: TransformationType,
		sourcePath: string,
		sourceMtime: number,
		contentType: 'document' | 'tag' | 'folder'
	): Promise<void> {
		if (!this.embeddingModel || !this.insightManager) {
			return;
		}

		try {
			// 生成洞察内容的嵌入向量
			const insightEmbedding = await this.embeddingModel.getEmbedding(result);

			// 保存到数据库
			await this.insightManager.storeInsight(
				{
					insightType: transformationType,
					insight: result,
					sourceType: contentType,
					sourcePath: sourcePath,
					sourceMtime: sourceMtime,
					embedding: insightEmbedding,
				},
				this.embeddingModel
			);

			console.log(`转换结果已成功保存到数据库: ${transformationType} for ${sourcePath}`);
		} catch (dbError) {
			console.warn('保存洞察到数据库失败:', dbError);
			// 后台任务失败不影响主要的转换结果
		}
	}

	/**
	 * 主要的转换执行方法 - 支持所有类型的转换
	 */
	async runTransformation(params: TransformationParams): Promise<TransformationResult> {
		console.log("runTransformation", params);
		const {
			filePath,
			contentType = 'document',
			transformationType,
			model,
			maxContentTokens,
			saveToDatabase = false,
			workspaceMetadata
		} = params;

		try {
			let content: string;
			let sourcePath: string;
			let sourceMtime: number;

			// 根据内容类型获取内容和元数据
			switch (contentType) {
				case 'document': {
					// 第一步：获取文件元信息
					const metadataResult = await this.getFileMetadata(filePath);
					if (metadataResult.success === false) {
						return {
							success: false,
							error: metadataResult.error
						};
					}

					sourcePath = metadataResult.sourcePath;
					sourceMtime = metadataResult.sourceMtime;

					// 检查数据库缓存
					const cacheCheckResult = await this.checkDatabaseCache(
						sourcePath,
						sourceMtime,
						transformationType
					);
					if (cacheCheckResult.foundCache) {
						return cacheCheckResult.result;
					}

					// 获取文件内容
					const fileContentResult = await this.getFileContent(filePath);
					if (fileContentResult.success === false) {
						return {
							success: false,
							error: fileContentResult.error
						};
					}
					content = fileContentResult.fileContent;
					break;
				}

				case 'folder': {
					sourcePath = filePath;
					sourceMtime = Date.now();

					// 检查数据库缓存
					const cacheCheckResult = await this.checkDatabaseCache(
						sourcePath,
						sourceMtime,
						transformationType
					);
					if (cacheCheckResult.foundCache) {
						return cacheCheckResult.result;
					}

					// 获取文件夹内容
					const folderContentResult = await this.processFolderContent(filePath);
					if (!folderContentResult.success) {
						return {
							success: false,
							error: folderContentResult.error
						};
					}
					content = folderContentResult.content;
					break;
				}

				case 'workspace': {
					if (!workspaceMetadata?.workspace) {
						return {
							success: false,
							error: '工作区对象未提供'
						};
					}

					sourcePath = `workspace:${workspaceMetadata.workspace.name}`;
					sourceMtime = Date.now();

					// 检查数据库缓存
					const cacheCheckResult = await this.checkDatabaseCache(
						sourcePath,
						sourceMtime,
						transformationType
					);
					if (cacheCheckResult.foundCache) {
						return cacheCheckResult.result;
					}

					// 处理工作区内容
					const workspaceContentResult = await this.processWorkspaceContent(
						workspaceMetadata.workspace,
						transformationType,
						model
					);

					if (!workspaceContentResult.success) {
						return {
							success: false,
							error: workspaceContentResult.error
						};
					}
					content = workspaceContentResult.content;
					break;
				}

				default:
					return {
						success: false,
						error: `不支持的内容类型: ${contentType}`
					};
			}

			// 验证内容
			const contentValidation = DocumentProcessor.validateContent(content);
			if (contentValidation.isErr()) {
				return {
					success: false,
					error: contentValidation.error.message
				};
			}

			// 获取转换配置
			const transformationConfig = TRANSFORMATIONS[transformationType];
			if (!transformationConfig) {
				return {
					success: false,
					error: `不支持的转换类型: ${transformationType}`
				};
			}

			// 处理文档内容（检查 token 数量并截断）
			const tokenLimit = maxContentTokens || DocumentProcessor['DEFAULT_MAX_TOKENS'];
			const processedDocument = await DocumentProcessor.processContent(content, tokenLimit);

			// 使用默认模型或传入的模型
			const llmModel: LLMModel = model || {
				provider: this.settings.applyModelProvider,
				modelId: this.settings.applyModelId,
			};

			// 创建 LLM 客户端
			const client = new TransformationLLMClient(this.llmManager, llmModel);

			// 构建请求消息
			const messages: RequestMessage[] = [
				{
					role: 'system',
					content: transformationConfig.prompt.replace('{userLanguage}', getFullLanguageName(getLanguage()))
				},
				{
					role: 'user',
					content: processedDocument.processedContent
				}
			];

			// 调用 LLM 执行转换
			const result = await client.queryChatModel(messages);

			if (result.isErr()) {
				return {
					success: false,
					error: `LLM 调用失败: ${result.error.message}`,
					truncated: processedDocument.truncated,
					originalTokens: processedDocument.originalTokens,
					processedTokens: processedDocument.processedTokens
				};
			}

			// 后处理结果
			const processedResult = this.postProcessResult(result.value, transformationType);

			// 保存转换结果到数据库（后台任务，不阻塞主流程）
			if (saveToDatabase) {
				// 创建后台任务，不使用 await
				(async () => {
					await this.saveResultToDatabase(
						processedResult,
						transformationType,
						sourcePath,
						sourceMtime,
						contentType === 'workspace' ? 'folder' : contentType // workspace 在数据库中存储为 folder 类型
					);
				})(); // 立即执行异步函数，但不等待其完成
			}

			return {
				success: true,
				result: processedResult,
				truncated: processedDocument.truncated,
				originalTokens: processedDocument.originalTokens,
				processedTokens: processedDocument.processedTokens
			};

		} catch (error) {
			return {
				success: false,
				error: `转换过程中出现错误: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}

	/**
	 * 获取文件夹内容
	 */
	private async processFolderContent(folderPath: string): Promise<{
		success: boolean;
		content?: string;
		error?: string;
	}> {
		try {
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!folder || !(folder instanceof TFolder)) {
				return {
					success: false,
					error: `文件夹不存在: ${folderPath}`
				};
			}

			// 获取文件夹直接子级的文件和文件夹
			const directFiles = this.app.vault.getMarkdownFiles().filter(file => {
				const fileDirPath = file.path.substring(0, file.path.lastIndexOf('/'));
				return fileDirPath === folderPath;
			});

			const directSubfolders = folder.children.filter((child): child is TFolder => child instanceof TFolder);

			if (directFiles.length === 0 && directSubfolders.length === 0) {
				return {
					success: false,
					error: `文件夹为空: ${folderPath}`
				};
			}

			// 构建文件夹内容描述
			let content = `# Folder Summary: ${folderPath}\n\n`;

			// 处理直接子文件
			if (directFiles.length > 0) {
				content += `## File Content Summaries\n\n`;
				const fileSummaries: string[] = [];
				
				for (const file of directFiles) {
					const fileResult = await this.runTransformation({
						filePath: file.path,
						contentType: 'document',
						transformationType: TransformationType.DENSE_SUMMARY,
						saveToDatabase: true
					});

					if (fileResult.success && fileResult.result) {
						fileSummaries.push(`### ${file.name}\n${fileResult.result}`);
					} else {
						console.warn(`处理文件失败: ${file.path}`, fileResult.error);
					}
				}

				content += fileSummaries.join('\n\n');
				
				if (directSubfolders.length > 0) {
					content += '\n\n';
				}
			}

			// 处理直接子文件夹
			if (directSubfolders.length > 0) {
				content += `## Subfolder Summaries\n\n`;
				const subfolderSummaries: string[] = [];

				for (const subfolder of directSubfolders) {
					const subfolderResult = await this.runTransformation({
						filePath: subfolder.path,
						contentType: 'folder',
						transformationType: TransformationType.HIERARCHICAL_SUMMARY,
						saveToDatabase: true
					});

					if (subfolderResult.success && subfolderResult.result) {
						subfolderSummaries.push(`### ${subfolder.name}\n${subfolderResult.result}`);
					} else {
						console.warn(`处理子文件夹失败: ${subfolder.path}`, subfolderResult.error);
					}
				}

				content += subfolderSummaries.join('\n\n');
			}

			return {
				success: true,
				content
			};

		} catch (error) {
			return {
				success: false,
				error: `获取文件夹内容失败: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}

	/**
	 * 处理工作区内容 - 根据workspace配置递归处理文件和文件夹
	 */
	private async processWorkspaceContent(
		workspace: import('../../database/json/workspace/types').Workspace,
		transformationType: TransformationType,
		model?: LLMModel
	): Promise<{
		success: boolean;
		content?: string;
		error?: string;
	}> {
		try {
			// 根据 workspace 配置获取相应的文件和文件夹
			const workspaceFiles: string[] = []
			const workspaceFolders: string[] = []

			// 解析 workspace 的 content 配置
			for (const contentItem of workspace.content) {
				if (contentItem.type === 'folder') {
					// 添加文件夹到列表
					workspaceFolders.push(contentItem.content)
				} else if (contentItem.type === 'tag') {
					// 对于标签类型，搜索包含该标签的文件
					const taggedFiles = this.getFilesByTag(contentItem.content)
					workspaceFiles.push(...taggedFiles.map(f => f.path))
				}
			}

			if (workspaceFiles.length === 0 && workspaceFolders.length === 0) {
				return {
					success: false,
					error: `工作区 "${workspace.name}" 没有找到任何内容`
				}
			}

			// 构建工作区内容描述
			let content = `# Workspace Summary: ${workspace.name}\n\n`
			const description = typeof workspace.metadata?.description === 'string' ? workspace.metadata.description : undefined
			if (description) {
				content += `Workspace Description: ${description}\n\n`
			}

			const childSummaries: string[] = []

			// 处理工作区配置的文件
			if (workspaceFiles.length > 0) {
				content += `## File Summaries (${workspaceFiles.length} files)\n\n`
				
				for (const filePath of workspaceFiles) {
					const fileName = filePath.split('/').pop() || filePath
					
					const fileResult = await this.runTransformation({
						filePath: filePath,
						contentType: 'document',
						transformationType: TransformationType.DENSE_SUMMARY,
						model: model,
						saveToDatabase: true
					})

					if (fileResult.success && fileResult.result) {
						childSummaries.push(`### ${fileName}\n${fileResult.result}`)
					} else {
						console.warn(`处理文件失败: ${filePath}`, fileResult.error)
						childSummaries.push(`### ${fileName}\n*处理失败: ${fileResult.error}*`)
					}
				}

				if (workspaceFolders.length > 0) {
					content += '\n\n'
				}
			}

			// 处理工作区配置的文件夹
			if (workspaceFolders.length > 0) {
				content += `## Folder Summaries (${workspaceFolders.length} folders)\n\n`
				
				for (const folderPath of workspaceFolders) {
					const folderName = folderPath.split('/').pop() || folderPath
					
					const folderResult = await this.runTransformation({
						filePath: folderPath,
						contentType: 'folder',
						transformationType: TransformationType.HIERARCHICAL_SUMMARY,
						model: model,
						saveToDatabase: true
					})

					if (folderResult.success && folderResult.result) {
						childSummaries.push(`### ${folderName}/\n${folderResult.result}`)
					} else {
						console.warn(`处理文件夹失败: ${folderPath}`, folderResult.error)
						childSummaries.push(`### ${folderName}/\n*处理失败: ${folderResult.error}*`)
					}
				}
			}

			// 合并所有子摘要
			content += childSummaries.join('\n\n')

			return {
				success: true,
				content
			}

		} catch (error) {
			return {
				success: false,
				error: `处理工作区内容失败: ${error instanceof Error ? error.message : String(error)}`
			}
		}
	}

	/**
	 * 后处理转换结果
	 */
	private postProcessResult(result: string, transformationType: TransformationType): string {
		let processed = result.trim();

		// 移除可能的 markdown 代码块标记
		processed = processed.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');

		// 根据转换类型进行特定的后处理
		switch (transformationType) {
			case TransformationType.KEY_INSIGHTS:
				// 确保 insights 格式正确
				if (!processed.includes('INSIGHTS')) {
					processed = `# INSIGHTS\n\n${processed}`;
				}
				break;

			case TransformationType.REFLECTIONS:
				// 确保 reflections 格式正确
				if (!processed.includes('REFLECTIONS')) {
					processed = `# REFLECTIONS\n\n${processed}`;
				}
				break;

			case TransformationType.ANALYZE_PAPER: {
				// 确保论文分析包含所有必需的部分
				const requiredSections = ['PURPOSE', 'CONTRIBUTION', 'KEY FINDINGS', 'IMPLICATIONS', 'LIMITATIONS'];
				const hasAllSections = requiredSections.every(section =>
					processed.toUpperCase().includes(section)
				);

				if (!hasAllSections) {
					// 如果缺少某些部分，添加提示
					processed += '\n\n*注意：某些分析部分可能不完整，建议重新处理或检查原始内容。*';
				}
				break;
			}

			case TransformationType.CONCISE_DENSE_SUMMARY:
			case TransformationType.HIERARCHICAL_SUMMARY:
				// 新的摘要类型不需要特殊的后处理，保持原样
				break;
		}

		return processed;
	}

	/**
	 * 获取所有可用的转换类型和描述
	 */
	static getAvailableTransformations(): Array<{ type: TransformationType, description: string }> {
		return Object.values(TRANSFORMATIONS).map(config => ({
			type: config.type,
			description: config.description
		}));
	}

	/**
	 * 查询洞察数据库（类似 RAGEngine 的 processQuery 接口）
	 */
	async processQuery({
		query,
		scope,
		limit,
		minSimilarity,
		insightTypes,
	}: {
		query: string
		scope?: {
			files: string[]
			folders: string[]
		}
		limit?: number
		minSimilarity?: number
		insightTypes?: TransformationType[]
	}): Promise<
		(Omit<import('../../database/schema').SelectSourceInsight, 'embedding'> & {
			similarity: number
		})[]
	> {
		if (!this.embeddingModel || !this.insightManager) {
			console.warn('TransEngine: embedding model or insight manager not available')
			return []
		}

		try {
			// 生成查询向量
			const queryVector = await this.embeddingModel.getEmbedding(query)
			
			// 构建 sourcePaths 过滤条件
			let sourcePaths: string[] | undefined
			if (scope) {
				sourcePaths = []
				// 添加直接指定的文件
				if (scope.files.length > 0) {
					sourcePaths.push(...scope.files)
				}
				// 添加文件夹下的所有文件
				if (scope.folders.length > 0) {
					for (const folderPath of scope.folders) {
						const folder = this.app.vault.getAbstractFileByPath(folderPath)
						if (folder && folder instanceof TFolder) {
							// 获取文件夹下的所有 Markdown 文件
							const folderFiles = this.app.vault.getMarkdownFiles().filter(file => 
								file.path.startsWith(folderPath + '/')
							)
							sourcePaths.push(...folderFiles.map(f => f.path))
						}
					}
				}
			}

			// 执行相似度搜索
			const results = await this.insightManager.performSimilaritySearch(
				queryVector,
				this.embeddingModel,
				{
					minSimilarity: minSimilarity ?? 0.3, // 默认最小相似度
					limit: limit ?? 20, // 默认限制
					sourcePaths: sourcePaths,
					insightTypes: insightTypes?.map(type => type.toString()),
				}
			)

			return results
		} catch (error) {
			console.error('TransEngine query failed:', error)
			return []
		}
	}

	/**
	 * 获取所有洞察数据
	 */
	async getAllInsights(): Promise<Omit<import('../../database/schema').SelectSourceInsight, 'embedding'>[]> {
		if (!this.embeddingModel || !this.insightManager) {
			console.warn('TransEngine: embedding model or insight manager not available')
			return []
		}

		try {
			const allInsights = await this.insightManager.getAllInsights(this.embeddingModel)
			// 移除 embedding 字段，避免返回大量数据
			return allInsights.map((insight) => {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { embedding, ...rest } = insight;
				return rest;
			});
		} catch (error) {
			console.error('TransEngine getAllInsights failed:', error)
			return []
		}
	}

	/**
	 * 根据标签获取文件
	 */
	private getFilesByTag(tag: string): import('obsidian').TFile[] {
		const files = this.app.vault.getMarkdownFiles()
		const taggedFiles: import('obsidian').TFile[] = []

		for (const file of files) {
			// 这里需要检查文件的前置元数据或内容中的标签
			// 简单实现：检查文件内容中是否包含该标签
			try {
				const cache = this.app.metadataCache.getFileCache(file)
				if (cache?.tags?.some(t => t.tag === `#${tag}` || t.tag === tag)) {
					taggedFiles.push(file)
				}
			} catch (error) {
				console.warn(`检查文件标签失败: ${file.path}`, error)
			}
		}

		return taggedFiles
	}

	/**
	 * 递归处理文件夹
	 */
	private async processFolderHierarchically(params: {
		folderPath: string
		llmModel: LLMModel
		concurrencyLimiter: ConcurrencyLimiter
		signal?: AbortSignal
		onFileProcessed: () => void
		onFolderProcessed: () => void
	}): Promise<string | null> {
		const { folderPath, llmModel, concurrencyLimiter, signal, onFileProcessed, onFolderProcessed } = params

		const folder = this.app.vault.getAbstractFileByPath(folderPath)
		if (!folder || !(folder instanceof TFolder)) {
			return null
		}

		// 获取文件夹直接子级的文件和文件夹
		const directFiles = this.app.vault.getMarkdownFiles().filter(file => {
			const fileDirPath = file.path.substring(0, file.path.lastIndexOf('/'))
			return fileDirPath === folderPath
		})

		const directSubfolders = folder.children.filter((child): child is TFolder => child instanceof TFolder)

		if (directFiles.length === 0 && directSubfolders.length === 0) {
			return null // 空文件夹
		}

		const childSummaries: string[] = []

		// 并行处理直接子文件
		if (directFiles.length > 0) {
			const filePromises = directFiles.map(file => 
				concurrencyLimiter.execute(async () => {
					if (signal?.aborted) {
						throw new Error('Operation was aborted')
					}

					const summary = await this.processSingleFile(file.path, llmModel)
					if (summary) {
						onFileProcessed()
						return `**${file.name}**: ${summary}`
					}
					return null
				})
			)

			const fileResults = await Promise.all(filePromises)
			const validFileResults = fileResults.filter((result): result is string => result !== null)
			childSummaries.push(...validFileResults)
		}

		// 并行处理直接子文件夹
		if (directSubfolders.length > 0) {
			const folderPromises = directSubfolders.map(subfolder => 
				concurrencyLimiter.execute(async () => {
					if (signal?.aborted) {
						throw new Error('Operation was aborted')
					}

					const summary = await this.processFolderHierarchically({
						folderPath: subfolder.path,
						llmModel,
						concurrencyLimiter,
						signal,
						onFileProcessed,
						onFolderProcessed
					})
					if (summary) {
						onFolderProcessed()
						return `**${subfolder.name}/**: ${summary}`
					}
					return null
				})
			)

			const folderResults = await Promise.all(folderPromises)
			const validFolderResults = folderResults.filter((result): result is string => result !== null)
			childSummaries.push(...validFolderResults)
		}

		if (childSummaries.length === 0) {
			return null
		}

		// 生成当前文件夹的摘要
		const combinedContent = childSummaries.join('\n\n')
		const folderSummary = await this.generateHierarchicalSummary(
			combinedContent,
			`Folder: ${folderPath}`,
			llmModel
		)

		// 保存文件夹摘要到数据库
		await this.saveFolderSummaryToDatabase(folderSummary, folderPath)

		return folderSummary
	}

	/**
	 * 处理单个文件
	 */
	private async processSingleFile(filePath: string, llmModel: LLMModel): Promise<string | null> {
		try {
			// 检查缓存
			const fileMetadata = await this.getFileMetadata(filePath)
			if (!fileMetadata.success) {
				console.warn(`无法获取文件元数据: ${filePath}`)
				return null
			}

			const cacheResult = await this.checkDatabaseCache(
				fileMetadata.sourcePath,
				fileMetadata.sourceMtime,
				TransformationType.CONCISE_DENSE_SUMMARY
			)

			if (cacheResult.foundCache && cacheResult.result.success && cacheResult.result.result) {
				return cacheResult.result.result
			}

			// 获取文件内容
			const contentResult = await this.getFileContent(filePath)
			if (!contentResult.success) {
				console.warn(`无法读取文件内容: ${filePath}`)
				return null
			}

			// 验证内容
			const contentValidation = DocumentProcessor.validateContent(contentResult.fileContent)
			if (contentValidation.isErr()) {
				console.warn(`文件内容无效: ${filePath}`)
				return null
			}

			// 处理文档内容
			const processedDocument = await DocumentProcessor.processContent(
				contentResult.fileContent,
				DocumentProcessor['DEFAULT_MAX_TOKENS']
			)

			// 生成摘要
			const summary = await this.generateConciseDenseSummary(
				processedDocument.processedContent,
				llmModel
			)

			// 保存到数据库
			await this.saveResultToDatabase(
				summary,
				TransformationType.CONCISE_DENSE_SUMMARY,
				fileMetadata.sourcePath,
				fileMetadata.sourceMtime,
				'document'
			)

			return summary

		} catch (error) {
			console.warn(`处理文件失败: ${filePath}`, error)
			return null
		}
	}

	/**
	 * 生成简洁密集摘要
	 */
	private async generateConciseDenseSummary(content: string, llmModel: LLMModel): Promise<string> {
		const client = new TransformationLLMClient(this.llmManager, llmModel)
		const messages: RequestMessage[] = [
			{
				role: 'system',
				content: CONCISE_DENSE_SUMMARY_PROMPT
			},
			{
				role: 'user',
				content: content
			}
		]

		const result = await client.queryChatModel(messages)
		if (result.isErr()) {
			throw new Error(`生成摘要失败: ${result.error.message}`)
		}

		return this.postProcessResult(result.value, TransformationType.CONCISE_DENSE_SUMMARY)
	}

	/**
	 * 生成分层摘要
	 */
	private async generateHierarchicalSummary(
		combinedContent: string, 
		contextLabel: string, 
		llmModel: LLMModel
	): Promise<string> {
		const client = new TransformationLLMClient(this.llmManager, llmModel)
		const messages: RequestMessage[] = [
			{
				role: 'system',
				content: HIERARCHICAL_SUMMARY_PROMPT
			},
			{
				role: 'user',
				content: `${contextLabel}\n\n${combinedContent}`
			}
		]

		const result = await client.queryChatModel(messages)
		if (result.isErr()) {
			throw new Error(`生成分层摘要失败: ${result.error.message}`)
		}

		return this.postProcessResult(result.value, TransformationType.HIERARCHICAL_SUMMARY)
	}

	/**
	 * 保存文件夹摘要到数据库
	 */
	private async saveFolderSummaryToDatabase(summary: string, folderPath: string): Promise<void> {
		if (!this.embeddingModel || !this.insightManager) {
			return
		}

		try {
			const embedding = await this.embeddingModel.getEmbedding(summary)
			await this.insightManager.storeInsight(
				{
					insightType: TransformationType.HIERARCHICAL_SUMMARY,
					insight: summary,
					sourceType: 'folder',
					sourcePath: folderPath,
					sourceMtime: Date.now(),
					embedding: embedding,
				},
				this.embeddingModel
			)
			console.log(`文件夹摘要已保存到数据库: ${folderPath}`)
		} catch (error) {
			console.warn('保存文件夹摘要到数据库失败:', error)
		}
	}

	/**
	 * 删除工作区的所有转换
	 * 
	 * @param workspace 工作区对象，如果为 null 则删除默认 vault 工作区的转换
	 * @returns 删除操作的结果
	 */
	async deleteWorkspaceTransformations(
		workspace: import('../../database/json/workspace/types').Workspace | null = null
	): Promise<{
		success: boolean;
		deletedCount: number;
		error?: string;
	}> {
		if (!this.embeddingModel || !this.insightManager) {
			return {
				success: false,
				deletedCount: 0,
				error: '缺少必要的组件：嵌入模型或洞察管理器'
			}
		}

		try {
			const sourcePaths: string[] = []
			let workspaceName: string

			if (workspace) {
				workspaceName = workspace.name
				
				// 添加工作区本身的洞察路径
				sourcePaths.push(`workspace:${workspaceName}`)

				// 解析工作区内容并收集所有相关路径
				for (const contentItem of workspace.content) {
					if (contentItem.type === 'folder') {
						const folderPath = contentItem.content
						
						// 添加文件夹路径本身
						sourcePaths.push(folderPath)
						
						// 获取文件夹下的所有文件
						const files = this.app.vault.getMarkdownFiles().filter(file => 
							file.path.startsWith(folderPath === '/' ? '' : folderPath + '/')
						)
						
						// 添加所有文件路径
						files.forEach(file => {
							sourcePaths.push(file.path)
						})

						// 添加中间文件夹路径
						files.forEach(file => {
							const dirPath = file.path.substring(0, file.path.lastIndexOf('/'))
							if (dirPath && dirPath !== folderPath) {
								let currentPath = folderPath === '/' ? '' : folderPath
								const pathParts = dirPath.substring(currentPath.length).split('/').filter(Boolean)
								
								for (let i = 0; i < pathParts.length; i++) {
									currentPath += (currentPath ? '/' : '') + pathParts[i]
									if (!sourcePaths.includes(currentPath)) {
										sourcePaths.push(currentPath)
									}
								}
							}
						})

					} else if (contentItem.type === 'tag') {
						// 获取标签对应的所有文件
						const tagFiles = this.getFilesByTag(contentItem.content)
						
						tagFiles.forEach(file => {
							sourcePaths.push(file.path)
							
							// 添加文件所在的文件夹路径
							const dirPath = file.path.substring(0, file.path.lastIndexOf('/'))
							if (dirPath) {
								const pathParts = dirPath.split('/').filter(Boolean)
								let currentPath = ''
								
								for (let i = 0; i < pathParts.length; i++) {
									currentPath += (currentPath ? '/' : '') + pathParts[i]
									if (!sourcePaths.includes(currentPath)) {
										sourcePaths.push(currentPath)
									}
								}
							}
						})
					}
				}
			} else {
				// 处理默认 vault 工作区 - 删除所有洞察
				workspaceName = 'vault'
				sourcePaths.push(`workspace:${workspaceName}`)
				
				// 获取所有洞察来确定删除数量
				const allInsights = await this.insightManager.getAllInsights(this.embeddingModel)
				
				// 对于 vault 工作区，删除所有洞察
				await this.insightManager.clearAllInsights(this.embeddingModel)
				
				console.log(`已删除 vault 工作区的所有 ${allInsights.length} 个转换`)
				
				return {
					success: true,
					deletedCount: allInsights.length
				}
			}

			// 去重路径
			const uniquePaths = [...new Set(sourcePaths)]
			
			// 获取将要删除的洞察数量
			const existingInsights = await this.insightManager.getAllInsights(this.embeddingModel)
			const insightsToDelete = existingInsights.filter(insight => 
				uniquePaths.includes(insight.source_path)
			)
			const deletedCount = insightsToDelete.length

			// 批量删除洞察
			if (uniquePaths.length > 0) {
				await this.insightManager.deleteInsightsBySourcePaths(uniquePaths, this.embeddingModel)
				console.log(`已删除工作区 "${workspaceName}" 的 ${deletedCount} 个转换，涉及 ${uniquePaths.length} 个路径`)
			}

			return {
				success: true,
				deletedCount: deletedCount
			}

		} catch (error) {
			console.error('删除工作区转换失败:', error)
			return {
				success: false,
				deletedCount: 0,
				error: `删除工作区转换失败: ${error instanceof Error ? error.message : String(error)}`
			}
		}
	}

	/**
	 * 删除指定工作区名称的所有转换（便捷方法）
	 * 
	 * @param workspaceName 工作区名称
	 * @returns 删除操作的结果
	 */
	async deleteWorkspaceTransformationsByName(workspaceName: string): Promise<{
		success: boolean;
		deletedCount: number;
		error?: string;
	}> {
		if (!this.embeddingModel || !this.insightManager) {
			return {
				success: false,
				deletedCount: 0,
				error: '缺少必要的组件：嵌入模型或洞察管理器'
			}
		}

		try {
			// 删除工作区本身的洞察
			const workspaceInsightPath = `workspace:${workspaceName}`
			
			// 获取所有洞察并筛选出该工作区相关的
			const allInsights = await this.insightManager.getAllInsights(this.embeddingModel)
			const workspaceInsights = allInsights.filter(insight => 
				insight.source_path === workspaceInsightPath
			)

			if (workspaceInsights.length > 0) {
				await this.insightManager.deleteInsightsBySourcePath(workspaceInsightPath, this.embeddingModel)
				console.log(`已删除工作区 "${workspaceName}" 的 ${workspaceInsights.length} 个转换`)
			}

			return {
				success: true,
				deletedCount: workspaceInsights.length
			}

		} catch (error) {
			console.error('删除工作区转换失败:', error)
			return {
				success: false,
				deletedCount: 0,
				error: `删除工作区转换失败: ${error instanceof Error ? error.message : String(error)}`
			}
		}
	}

	/**
	 * 删除单个洞察
	 * 
	 * @param insightId 洞察ID
	 * @returns 删除操作的结果
	 */
	async deleteSingleInsight(insightId: number): Promise<{
		success: boolean;
		error?: string;
	}> {
		if (!this.embeddingModel || !this.insightManager) {
			return {
				success: false,
				error: '缺少必要的组件：嵌入模型或洞察管理器'
			}
		}

		try {
			// 直接按ID删除洞察
			await this.insightManager.deleteInsightById(insightId, this.embeddingModel)
			
			console.log(`已删除洞察 ID: ${insightId}`)

			return {
				success: true
			}

		} catch (error) {
			console.error('删除单个洞察失败:', error)
			return {
				success: false,
				error: `删除单个洞察失败: ${error instanceof Error ? error.message : String(error)}`
			}
		}
	}
}
