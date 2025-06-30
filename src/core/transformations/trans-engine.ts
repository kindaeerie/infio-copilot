import { Result, err, ok } from "neverthrow";
import { App } from 'obsidian';

import { DBManager } from '../../database/database-manager';
import { InsightManager } from '../../database/modules/insight/insight-manager';
import { EmbeddingModel } from '../../types/embedding';
import { LLMModel } from '../../types/llm/model';
import { RequestMessage } from '../../types/llm/request';
import { InfioSettings } from '../../types/settings';
import { readTFileContentPdf } from '../../utils/obsidian';
import { tokenCount } from '../../utils/token';
import LLMManager from '../llm/manager';
import { ANALYZE_PAPER_DESCRIPTION, ANALYZE_PAPER_PROMPT } from '../prompts/transformations/analyze-paper';
import { DENSE_SUMMARY_DESCRIPTION, DENSE_SUMMARY_PROMPT } from '../prompts/transformations/dense-summary';
import { KEY_INSIGHTS_DESCRIPTION, KEY_INSIGHTS_PROMPT } from '../prompts/transformations/key-insights';
import { REFLECTIONS_DESCRIPTION, REFLECTIONS_PROMPT } from '../prompts/transformations/reflections';
import { SIMPLE_SUMMARY_DESCRIPTION, SIMPLE_SUMMARY_PROMPT } from '../prompts/transformations/simple-summary';
import { TABLE_OF_CONTENTS_DESCRIPTION, TABLE_OF_CONTENTS_PROMPT } from '../prompts/transformations/table-of-contents';
import { getEmbeddingModel } from '../rag/embedding';

// 转换类型枚举
export enum TransformationType {
	DENSE_SUMMARY = 'dense_summary',
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
	filePath: string;  // 必须的文件路径
	contentType?: 'document' | 'tag' | 'folder';
	transformationType: TransformationType;
	model?: LLMModel;
	maxContentTokens?: number;
	saveToDatabase?: boolean;
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
				insight.insight_type === transformationType &&
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
		contentType: string
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
	 * 主要的转换执行方法
	 */
	async runTransformation(params: TransformationParams): Promise<TransformationResult> {
		console.log("runTransformation", params);
		const {
			filePath,
			contentType = 'document',
			transformationType,
			model,
			maxContentTokens,
			saveToDatabase = false
		} = params;

		try {
			// 第一步：获取文件元信息
			const metadataResult = await this.getFileMetadata(filePath);

			if (!metadataResult.success) {
				return {
					success: false,
					error: metadataResult.error
				};
			}

			// 此时TypeScript知道metadataResult.success为true
			const { sourcePath, sourceMtime } = metadataResult;

			// 第二步：检查数据库缓存
			const cacheCheckResult = await this.checkDatabaseCache(
				sourcePath,
				sourceMtime,
				transformationType
			);

			if (cacheCheckResult.foundCache) {
				return cacheCheckResult.result;
			}

			// 第三步：获取文件内容（只有在没有缓存时才执行）
			const fileContentResult = await this.getFileContent(filePath);

			if (!fileContentResult.success) {
				return {
					success: false,
					error: fileContentResult.error
				};
			}

			// 此时TypeScript知道fileContentResult.success为true
			const { fileContent } = fileContentResult;

			// 验证内容
			const contentValidation = DocumentProcessor.validateContent(fileContent);
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
			const processedDocument = await DocumentProcessor.processContent(fileContent, tokenLimit);

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
					content: transformationConfig.prompt
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
						contentType
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
		}

		return processed;
	}

	/**
	 * 批量执行转换
	 */
	async runBatchTransformations(
		filePath: string,
		transformationTypes: TransformationType[],
		options?: {
			model?: LLMModel;
			saveToDatabase?: boolean;
		}
	): Promise<Record<string, TransformationResult>> {
		const results: Record<string, TransformationResult> = {};

		// 并行执行所有转换
		const promises = transformationTypes.map(async (type) => {
			const result = await this.runTransformation({
				filePath: filePath,
				transformationType: type,
				model: options?.model,
				saveToDatabase: options?.saveToDatabase
			});
			return { type, result };
		});

		const completedResults = await Promise.all(promises);

		for (const { type, result } of completedResults) {
			results[type] = result;
		}

		return results;
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
} 
