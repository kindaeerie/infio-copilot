import { Result, err, ok } from "neverthrow";

import { LLMModel } from '../../types/llm/model';
import { RequestMessage } from '../../types/llm/request';
import { InfioSettings } from '../../types/settings';
import { tokenCount } from '../../utils/token';
import LLMManager from '../llm/manager';
import { ANALYZE_PAPER_DESCRIPTION, ANALYZE_PAPER_PROMPT } from '../prompts/transformations/analyze-paper';
import { DENSE_SUMMARY_DESCRIPTION, DENSE_SUMMARY_PROMPT } from '../prompts/transformations/dense-summary';
import { KEY_INSIGHTS_DESCRIPTION, KEY_INSIGHTS_PROMPT } from '../prompts/transformations/key-insights';
import { REFLECTIONS_DESCRIPTION, REFLECTIONS_PROMPT } from '../prompts/transformations/reflections';
import { SIMPLE_SUMMARY_DESCRIPTION, SIMPLE_SUMMARY_PROMPT } from '../prompts/transformations/simple-summary';
import { TABLE_OF_CONTENTS_DESCRIPTION, TABLE_OF_CONTENTS_PROMPT } from '../prompts/transformations/table-of-contents';

// 转换类型枚举
export enum TransformationType {
	DENSE_SUMMARY = 'dense-summary',
	ANALYZE_PAPER = 'analyze-paper',
	SIMPLE_SUMMARY = 'simple-summary',
	KEY_INSIGHTS = 'key-insights',
	TABLE_OF_CONTENTS = 'table-of-contents',
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
	content: string;
	transformationType: TransformationType;
	settings: InfioSettings;
	model?: LLMModel;
	maxContentTokens?: number;
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
 * 主要的转换执行函数
 */
export async function runTransformation(params: TransformationParams): Promise<TransformationResult> {
	const { content, transformationType, settings, model, maxContentTokens } = params;

	try {
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
			provider: settings.applyModelProvider,
			modelId: settings.applyModelId,
		};

		// 创建 LLM 管理器和客户端
		const llmManager = new LLMManager(settings);
		const client = new TransformationLLMClient(llmManager, llmModel);

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
		const processedResult = postProcessResult(result.value, transformationType);

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
function postProcessResult(result: string, transformationType: TransformationType): string {
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
export async function runBatchTransformations(
	content: string,
	transformationTypes: TransformationType[],
	settings: InfioSettings,
	model?: LLMModel
): Promise<Record<string, TransformationResult>> {
	const results: Record<string, TransformationResult> = {};

	// 并行执行所有转换
	const promises = transformationTypes.map(async (type) => {
		const result = await runTransformation({
			content,
			transformationType: type,
			settings,
			model
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
export function getAvailableTransformations(): Array<{ type: TransformationType, description: string }> {
	return Object.values(TRANSFORMATIONS).map(config => ({
		type: config.type,
		description: config.description
	}));
} 
