import { backOff } from 'exponential-backoff';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { minimatch } from 'minimatch';
import { App, Notice, TFile } from 'obsidian';
import pLimit from 'p-limit';
import removeMarkdown from 'remove-markdown';

import { IndexProgress } from '../../../components/chat-view/QueryProgress';
import {
	LLMAPIKeyInvalidException,
	LLMAPIKeyNotSetException,
	LLMBaseUrlNotSetException,
	LLMRateLimitExceededException,
} from '../../../core/llm/exception';
import { InsertVector, SelectVector } from '../../../database/schema';
import { EmbeddingModel } from '../../../types/embedding';
import { getFilesWithTag } from '../../../utils/glob-utils';
import { openSettingsModalWithError } from '../../../utils/open-settings-modal';
import { DBManager } from '../../database-manager';
import { Workspace } from '../../json/workspace/types';

import { VectorRepository } from './vector-repository';

export class VectorManager {
	private app: App
	private repository: VectorRepository
	private dbManager: DBManager

	constructor(app: App, dbManager: DBManager) {
		this.app = app
		this.dbManager = dbManager
		this.repository = new VectorRepository(app, dbManager.getPgClient())
	}

	async performSimilaritySearch(
		queryVector: number[],
		embeddingModel: EmbeddingModel,
		options: {
			minSimilarity: number
			limit: number
			scope?: {
				files: string[]
				folders: string[]
			}
		},
	): Promise<
		(Omit<SelectVector, 'embedding'> & {
			similarity: number
		})[]
	> {
		return await this.repository.performSimilaritySearch(
			queryVector,
			embeddingModel,
			options,
		)
	}

	async getWorkspaceStatistics(
		embeddingModel: EmbeddingModel,
		workspace?: Workspace
	): Promise<{
		totalFiles: number
		totalChunks: number
	}> {
		// 构建工作区范围
		let scope: { files: string[], folders: string[] } | undefined
		if (workspace) {
			const folders: string[] = []
			const files: string[] = []

			// 处理工作区中的文件夹和标签
			for (const item of workspace.content) {
				if (item.type === 'folder') {
					folders.push(item.content)
				} else if (item.type === 'tag') {
					// 获取标签对应的所有文件
					const tagFiles = getFilesWithTag(item.content, this.app)
					files.push(...tagFiles)
				}
			}

			// 只有当有文件夹或文件时才设置 scope
			if (folders.length > 0 || files.length > 0) {
				scope = { files, folders }
			}
		}

		if (scope) {
			return await this.repository.getWorkspaceStatistics(embeddingModel, scope)
		} else {
			return await this.repository.getVaultStatistics(embeddingModel)
		}
	}

	async getVaultStatistics(embeddingModel: EmbeddingModel): Promise<{
		totalFiles: number
		totalChunks: number
	}> {
		return await this.repository.getVaultStatistics(embeddingModel)
	}

	// 强制垃圾回收的辅助方法
	private forceGarbageCollection() {
		try {
			if (typeof global !== 'undefined' && global.gc) {
				global.gc()
			} else if (typeof window !== 'undefined' && (window as any).gc) {
				((window as any).gc as () => void)();
			}
		} catch (e) {
			// 忽略垃圾回收错误
		}
	}

	// 检查并清理内存的辅助方法
	private async memoryCleanup(batchCount: number) {
		// 每10批次强制垃圾回收
		if (batchCount % 10 === 0) {
			this.forceGarbageCollection()
			// 短暂延迟让内存清理完成
			await new Promise(resolve => setTimeout(resolve, 100))
		}
	}

	async updateVaultIndex(
		embeddingModel: EmbeddingModel,
		options: {
			chunkSize: number
			batchSize: number
			excludePatterns: string[]
			includePatterns: string[]
			reindexAll?: boolean
		},
		updateProgress?: (indexProgress: IndexProgress) => void,
	): Promise<void> {
		let filesToIndex: TFile[]
		if (options.reindexAll) {
			console.log("updateVaultIndex reindexAll")
			filesToIndex = await this.getFilesToIndex({
				embeddingModel: embeddingModel,
				excludePatterns: options.excludePatterns,
				includePatterns: options.includePatterns,
				reindexAll: true,
			})
			await this.repository.clearAllVectors(embeddingModel)
		} else {
			console.log("updateVaultIndex for update files")
			await this.cleanVectorsForDeletedFiles(embeddingModel)
			console.log("updateVaultIndex cleanVectorsForDeletedFiles")
			filesToIndex = await this.getFilesToIndex({
				embeddingModel: embeddingModel,
				excludePatterns: options.excludePatterns,
				includePatterns: options.includePatterns,
			})
			console.log("get files to index: ", filesToIndex.length)
			await this.repository.deleteVectorsForMultipleFiles(
				filesToIndex.map((file) => file.path),
				embeddingModel,
			)
			console.log("delete vectors for multiple files: ", filesToIndex.length)
		}
		console.log("get files to index: ", filesToIndex.length)

		if (filesToIndex.length === 0) {
			return
		}

		// Embed the files
		const overlap = Math.floor(options.chunkSize * 0.15)
		const textSplitter = new RecursiveCharacterTextSplitter({
			chunkSize: options.chunkSize,
			chunkOverlap: overlap,
			separators: [
				"\n\n",
				"\n",
				".",
				",",
				" ",
				"\u200b",  // Zero-width space
				"\uff0c",  // Fullwidth comma
				"\u3001",  // Ideographic comma
				"\uff0e",  // Fullwidth full stop
				"\u3002",  // Ideographic full stop
				"",
			],
		});
		console.log("textSplitter chunkSize: ", options.chunkSize, "overlap: ", overlap)

		const skippedFiles: string[] = []
		const contentChunks: InsertVector[] = (
			await Promise.all(
				filesToIndex.map(async (file) => {
					try {
						let fileContent = await this.app.vault.cachedRead(file)
						// 清理null字节，防止PostgreSQL UTF8编码错误
						fileContent = fileContent.replace(/\0/g, '')
						const fileDocuments = await textSplitter.createDocuments([
							fileContent,
						])
						return fileDocuments
							.map((chunk): InsertVector | null => {
								// 保存原始内容，不在此处调用 removeMarkdown
								const rawContent = chunk.pageContent.replace(/\0/g, '')
								if (!rawContent || rawContent.trim().length === 0) {
									return null
								}
								return {
									path: file.path,
									mtime: file.stat.mtime,
									content: rawContent, // 保存原始内容
									embedding: [],
									metadata: {
										startLine: Number(chunk.metadata.loc.lines.from),
										endLine: Number(chunk.metadata.loc.lines.to),
									},
								}
							})
							.filter((chunk): chunk is InsertVector => chunk !== null)
					} catch (error) {
						console.warn(`跳过文件 ${file.path}:`, error.message)
						skippedFiles.push(file.path)
						return []
					}
				}),
			)
		).flat()

		console.log("contentChunks: ", contentChunks.length)

		if (skippedFiles.length > 0) {
			console.warn(`跳过了 ${skippedFiles.length} 个有问题的文件:`, skippedFiles)
			new Notice(`跳过了 ${skippedFiles.length} 个有问题的文件`)
		}

		updateProgress?.({
			completedChunks: 0,
			totalChunks: contentChunks.length,
			totalFiles: filesToIndex.length,
		})

		const embeddingProgress = { completed: 0 }
		// 减少批量大小以降低内存压力
		const batchSize = options.batchSize
		let batchCount = 0

		try {
			if (embeddingModel.supportsBatch) {
				// 支持批量处理的提供商：使用流式处理逻辑
				for (let i = 0; i < contentChunks.length; i += batchSize) {
					batchCount++
					const batchChunks = contentChunks.slice(i, Math.min(i + batchSize, contentChunks.length))

					const embeddedBatch: InsertVector[] = []

					await backOff(
						async () => {
							// 在嵌入之前处理 markdown
							const cleanedBatchData = batchChunks.map(chunk => {
								const cleanContent = removeMarkdown(chunk.content)
								return { chunk, cleanContent }
							}).filter(({ cleanContent }) => cleanContent && cleanContent.trim().length > 0)

							if (cleanedBatchData.length === 0) {
								return
							}

							const batchTexts = cleanedBatchData.map(({ cleanContent }) => cleanContent)
							const batchEmbeddings = await embeddingModel.getBatchEmbeddings(batchTexts)

							// 合并embedding结果到chunk数据
							for (let j = 0; j < cleanedBatchData.length; j++) {
								const { chunk, cleanContent } = cleanedBatchData[j]
								const embeddedChunk: InsertVector = {
									path: chunk.path,
									mtime: chunk.mtime,
									content: cleanContent, // 使用已经清理过的内容
									embedding: batchEmbeddings[j],
									metadata: chunk.metadata,
								}
								embeddedBatch.push(embeddedChunk)
							}
						},
						{
							numOfAttempts: 3, // 减少重试次数
							startingDelay: 500, // 减少延迟
							timeMultiple: 1.5,
							jitter: 'full',
						},
					)

					// 立即插入当前批次，避免内存累积
					if (embeddedBatch.length > 0) {
						await this.repository.insertVectors(embeddedBatch, embeddingModel)
						// 清理批次数据
						embeddedBatch.length = 0
					}

					embeddingProgress.completed += batchChunks.length
					updateProgress?.({
						completedChunks: embeddingProgress.completed,
						totalChunks: contentChunks.length,
						totalFiles: filesToIndex.length,
					})

					// 定期内存清理
					await this.memoryCleanup(batchCount)
				}
			} else {
				// 不支持批量处理的提供商：使用流式处理逻辑
				const limit = pLimit(32) // 从50降低到10，减少并发压力
				const abortController = new AbortController()

				// 流式处理：分批处理并立即插入
				for (let i = 0; i < contentChunks.length; i += batchSize) {
					if (abortController.signal.aborted) {
						throw new Error('Operation was aborted')
					}

					batchCount++
					const batchChunks = contentChunks.slice(i, Math.min(i + batchSize, contentChunks.length))
					const embeddedBatch: InsertVector[] = []

					const tasks = batchChunks.map((chunk) =>
						limit(async () => {
							if (abortController.signal.aborted) {
								throw new Error('Operation was aborted')
							}
							try {
								await backOff(
									async () => {
										// 在嵌入之前处理 markdown
										const cleanContent = removeMarkdown(chunk.content).replace(/\0/g, '')
										// 跳过清理后为空的内容
										if (!cleanContent || cleanContent.trim().length === 0) {
											return
										}

										const embedding = await embeddingModel.getEmbedding(cleanContent)
										const embeddedChunk = {
											path: chunk.path,
											mtime: chunk.mtime,
											content: cleanContent, // 使用清理后的内容
											embedding,
											metadata: chunk.metadata,
										}
										embeddedBatch.push(embeddedChunk)
									},
									{
										numOfAttempts: 3, // 减少重试次数
										startingDelay: 500, // 减少延迟
										timeMultiple: 1.5,
										jitter: 'full',
									},
								)
							} catch (error) {
								abortController.abort()
								throw error
							}
						}),
					)

					await Promise.all(tasks)

					// 立即插入当前批次
					if (embeddedBatch.length > 0) {
						await this.repository.insertVectors(embeddedBatch, embeddingModel)
						// 清理批次数据
						embeddedBatch.length = 0
					}

					embeddingProgress.completed += batchChunks.length
					updateProgress?.({
						completedChunks: embeddingProgress.completed,
						totalChunks: contentChunks.length,
						totalFiles: filesToIndex.length,
					})

					// 定期内存清理
					await this.memoryCleanup(batchCount)
				}
			}
		} catch (error) {
			if (
				error instanceof LLMAPIKeyNotSetException ||
				error instanceof LLMAPIKeyInvalidException ||
				error instanceof LLMBaseUrlNotSetException
			) {
				openSettingsModalWithError(this.app, error.message)
			} else if (error instanceof LLMRateLimitExceededException) {
				new Notice(error.message)
			} else {
				console.error('Error embedding chunks:', error)
				throw error
			}
		} finally {
			// 最终清理
			this.forceGarbageCollection()
		}
	}

	async updateWorkspaceIndex(
		embeddingModel: EmbeddingModel,
		workspace: Workspace,
		options: {
			chunkSize: number
			batchSize: number
			excludePatterns: string[]
			includePatterns: string[]
			reindexAll?: boolean
		},
		updateProgress?: (indexProgress: IndexProgress) => void,
	): Promise<void> {
		let filesToIndex: TFile[]
		if (options.reindexAll) {
			console.log("updateWorkspaceIndex reindexAll")
			filesToIndex = await this.getFilesToIndexInWorkspace({
				embeddingModel: embeddingModel,
				workspace: workspace,
				excludePatterns: options.excludePatterns,
				includePatterns: options.includePatterns,
				reindexAll: true,
			})
			// 只清理工作区相关的向量，而不是全部
			const workspaceFilePaths = filesToIndex.map((file) => file.path)
			if (workspaceFilePaths.length > 0) {
				await this.repository.deleteVectorsForMultipleFiles(workspaceFilePaths, embeddingModel)
			}
		} else {
			console.log("updateWorkspaceIndex for update files")
			await this.cleanVectorsForDeletedFiles(embeddingModel)
			console.log("updateWorkspaceIndex cleanVectorsForDeletedFiles")
			filesToIndex = await this.getFilesToIndexInWorkspace({
				embeddingModel: embeddingModel,
				workspace: workspace,
				excludePatterns: options.excludePatterns,
				includePatterns: options.includePatterns,
			})
			console.log("get workspace files to index: ", filesToIndex.length)
			await this.repository.deleteVectorsForMultipleFiles(
				filesToIndex.map((file) => file.path),
				embeddingModel,
			)
			console.log("delete vectors for workspace files: ", filesToIndex.length)
		}
		console.log("get workspace files to index: ", filesToIndex.length)

		if (filesToIndex.length === 0) {
			return
		}

		// Embed the files (使用与 updateVaultIndex 相同的逻辑)
		const overlap = Math.floor(options.chunkSize * 0.15)
		const textSplitter = new RecursiveCharacterTextSplitter({
			chunkSize: options.chunkSize,
			chunkOverlap: overlap,
			separators: [
				"\n\n",
				"\n",
				".",
				",",
				" ",
				"\u200b",  // Zero-width space
				"\uff0c",  // Fullwidth comma
				"\u3001",  // Ideographic comma
				"\uff0e",  // Fullwidth full stop
				"\u3002",  // Ideographic full stop
				"",
			],
		});
		console.log("textSplitter chunkSize: ", options.chunkSize, "overlap: ", overlap)

		const skippedFiles: string[] = []
		const contentChunks: InsertVector[] = (
			await Promise.all(
				filesToIndex.map(async (file) => {
					try {
						let fileContent = await this.app.vault.cachedRead(file)
						// 清理null字节，防止PostgreSQL UTF8编码错误
						fileContent = fileContent.replace(/\0/g, '')
						const fileDocuments = await textSplitter.createDocuments([
							fileContent,
						])
						return fileDocuments
							.map((chunk): InsertVector | null => {
								// 保存原始内容，不在此处调用 removeMarkdown
								const rawContent = chunk.pageContent.replace(/\0/g, '')
								if (!rawContent || rawContent.trim().length === 0) {
									return null
								}
								return {
									path: file.path,
									mtime: file.stat.mtime,
									content: rawContent, // 保存原始内容
									embedding: [],
									metadata: {
										startLine: Number(chunk.metadata.loc.lines.from),
										endLine: Number(chunk.metadata.loc.lines.to),
									},
								}
							})
							.filter((chunk): chunk is InsertVector => chunk !== null)
					} catch (error) {
						console.warn(`跳过文件 ${file.path}:`, error.message)
						skippedFiles.push(file.path)
						return []
					}
				}),
			)
		).flat()

		console.log("contentChunks: ", contentChunks.length)

		if (skippedFiles.length > 0) {
			console.warn(`跳过了 ${skippedFiles.length} 个有问题的文件:`, skippedFiles)
			new Notice(`跳过了 ${skippedFiles.length} 个有问题的文件`)
		}

		updateProgress?.({
			completedChunks: 0,
			totalChunks: contentChunks.length,
			totalFiles: filesToIndex.length,
		})

		const embeddingProgress = { completed: 0 }
		// 减少批量大小以降低内存压力
		const batchSize = options.batchSize
		let batchCount = 0

		try {
			if (embeddingModel.supportsBatch) {
				// 支持批量处理的提供商：使用流式处理逻辑
				for (let i = 0; i < contentChunks.length; i += batchSize) {
					batchCount++
					const batchChunks = contentChunks.slice(i, Math.min(i + batchSize, contentChunks.length))

					const embeddedBatch: InsertVector[] = []

					await backOff(
						async () => {
							// 在嵌入之前处理 markdown，只处理一次
							const cleanedBatchData = batchChunks.map(chunk => {
								const cleanContent = removeMarkdown(chunk.content)
								return { chunk, cleanContent }
							}).filter(({ cleanContent }) => cleanContent && cleanContent.trim().length > 0)

							if (cleanedBatchData.length === 0) {
								return
							}

							const batchTexts = cleanedBatchData.map(({ cleanContent }) => cleanContent)
							const batchEmbeddings = await embeddingModel.getBatchEmbeddings(batchTexts)

							// 合并embedding结果到chunk数据
							for (let j = 0; j < cleanedBatchData.length; j++) {
								const { chunk, cleanContent } = cleanedBatchData[j]
								const embeddedChunk: InsertVector = {
									path: chunk.path,
									mtime: chunk.mtime,
									content: cleanContent, // 使用已经清理过的内容
									embedding: batchEmbeddings[j],
									metadata: chunk.metadata,
								}
								embeddedBatch.push(embeddedChunk)
							}
						},
						{
							numOfAttempts: 3, // 减少重试次数
							startingDelay: 500, // 减少延迟
							timeMultiple: 1.5,
							jitter: 'full',
						},
					)

					// 立即插入当前批次，避免内存累积
					if (embeddedBatch.length > 0) {
						await this.repository.insertVectors(embeddedBatch, embeddingModel)
						// 清理批次数据
						embeddedBatch.length = 0
					}

					embeddingProgress.completed += batchChunks.length
					updateProgress?.({
						completedChunks: embeddingProgress.completed,
						totalChunks: contentChunks.length,
						totalFiles: filesToIndex.length,
					})

					// 定期内存清理
					await this.memoryCleanup(batchCount)
				}
			} else {
				// 不支持批量处理的提供商：使用流式处理逻辑
				const limit = pLimit(32) // 从50降低到10，减少并发压力
				const abortController = new AbortController()

				// 流式处理：分批处理并立即插入
				for (let i = 0; i < contentChunks.length; i += batchSize) {
					if (abortController.signal.aborted) {
						throw new Error('Operation was aborted')
					}

					batchCount++
					const batchChunks = contentChunks.slice(i, Math.min(i + batchSize, contentChunks.length))
					const embeddedBatch: InsertVector[] = []

					const tasks = batchChunks.map((chunk) =>
						limit(async () => {
							if (abortController.signal.aborted) {
								throw new Error('Operation was aborted')
							}
							try {
								await backOff(
									async () => {
										// 在嵌入之前处理 markdown
										const cleanContent = removeMarkdown(chunk.content).replace(/\0/g, '')
										// 跳过清理后为空的内容
										if (!cleanContent || cleanContent.trim().length === 0) {
											return
										}

										const embedding = await embeddingModel.getEmbedding(cleanContent)
										const embeddedChunk = {
											path: chunk.path,
											mtime: chunk.mtime,
											content: cleanContent, // 使用清理后的内容
											embedding,
											metadata: chunk.metadata,
										}
										embeddedBatch.push(embeddedChunk)
									},
									{
										numOfAttempts: 3, // 减少重试次数
										startingDelay: 500, // 减少延迟
										timeMultiple: 1.5,
										jitter: 'full',
									},
								)
							} catch (error) {
								abortController.abort()
								throw error
							}
						}),
					)

					await Promise.all(tasks)

					// 立即插入当前批次
					if (embeddedBatch.length > 0) {
						await this.repository.insertVectors(embeddedBatch, embeddingModel)
						// 清理批次数据
						embeddedBatch.length = 0
					}

					embeddingProgress.completed += batchChunks.length
					updateProgress?.({
						completedChunks: embeddingProgress.completed,
						totalChunks: contentChunks.length,
						totalFiles: filesToIndex.length,
					})

					// 定期内存清理
					await this.memoryCleanup(batchCount)
				}
			}
		} catch (error) {
			if (
				error instanceof LLMAPIKeyNotSetException ||
				error instanceof LLMAPIKeyInvalidException ||
				error instanceof LLMBaseUrlNotSetException
			) {
				openSettingsModalWithError(this.app, error.message)
			} else if (error instanceof LLMRateLimitExceededException) {
				new Notice(error.message)
			} else {
				console.error('Error embedding chunks:', error)
				throw error
			}
		} finally {
			// 最终清理
			this.forceGarbageCollection()
		}
	}

	async UpdateFileVectorIndex(
		embeddingModel: EmbeddingModel,
		chunkSize: number,
		batchSize: number,
		file: TFile
	) {
		try {
			// Delete existing vectors for the files
			await this.repository.deleteVectorsForSingleFile(
				file.path,
				embeddingModel,
			)

			// Embed the files
			const overlap = Math.floor(chunkSize * 0.15)
			const textSplitter = new RecursiveCharacterTextSplitter({
				chunkSize: chunkSize,
				chunkOverlap: overlap,
				separators: [
					"\n\n",
					"\n",
					".",
					",",
					" ",
					"\u200b",  // Zero-width space
					"\uff0c",  // Fullwidth comma
					"\u3001",  // Ideographic comma
					"\uff0e",  // Fullwidth full stop
					"\u3002",  // Ideographic full stop
					"",
				],
			});
			let fileContent = await this.app.vault.cachedRead(file)
			// 清理null字节，防止PostgreSQL UTF8编码错误
			fileContent = fileContent.replace(/\0/g, '')
			const fileDocuments = await textSplitter.createDocuments([
				fileContent,
			])

			const contentChunks: InsertVector[] = fileDocuments
				.map((chunk): InsertVector | null => {
					// 保存原始内容，不在此处调用 removeMarkdown
					const rawContent = String(chunk.pageContent || '').replace(/\0/g, '')
					if (!rawContent || rawContent.trim().length === 0) {
						return null
					}
					return {
						path: file.path,
						mtime: file.stat.mtime,
						content: rawContent, // 保存原始内容
						embedding: [],
						metadata: {
							startLine: Number(chunk.metadata.loc.lines.from),
							endLine: Number(chunk.metadata.loc.lines.to),
						},
					}
				})
				.filter((chunk): chunk is InsertVector => chunk !== null)

			let batchCount = 0

			try {
				if (embeddingModel.supportsBatch) {
					// 支持批量处理的提供商：使用流式处理逻辑
					for (let i = 0; i < contentChunks.length; i += batchSize) {
						batchCount++
						console.log(`Embedding batch ${batchCount} of ${Math.ceil(contentChunks.length / batchSize)}`)
						const batchChunks = contentChunks.slice(i, Math.min(i + batchSize, contentChunks.length))

						const embeddedBatch: InsertVector[] = []

						await backOff(
							async () => {
								// 在嵌入之前处理 markdown，只处理一次
								const cleanedBatchData = batchChunks.map(chunk => {
									const cleanContent = removeMarkdown(chunk.content).replace(/\0/g, '')
									return { chunk, cleanContent }
								}).filter(({ cleanContent }) => cleanContent && cleanContent.trim().length > 0)

								if (cleanedBatchData.length === 0) {
									return
								}

								const batchTexts = cleanedBatchData.map(({ cleanContent }) => cleanContent)
								const batchEmbeddings = await embeddingModel.getBatchEmbeddings(batchTexts)

								// 合并embedding结果到chunk数据
								for (let j = 0; j < cleanedBatchData.length; j++) {
									const { chunk, cleanContent } = cleanedBatchData[j]
									const embeddedChunk: InsertVector = {
										path: chunk.path,
										mtime: chunk.mtime,
										content: cleanContent, // 使用已经清理过的内容
										embedding: batchEmbeddings[j],
										metadata: chunk.metadata,
									}
									embeddedBatch.push(embeddedChunk)
								}
							},
							{
								numOfAttempts: 3, // 减少重试次数
								startingDelay: 500, // 减少延迟
								timeMultiple: 1.5,
								jitter: 'full',
							},
						)

						// 立即插入当前批次
						if (embeddedBatch.length > 0) {
							await this.repository.insertVectors(embeddedBatch, embeddingModel)
							// 清理批次数据
							embeddedBatch.length = 0
						}

						// 定期内存清理
						await this.memoryCleanup(batchCount)
					}
				} else {
					// 不支持批量处理的提供商：使用流式处理逻辑
					const limit = pLimit(10) // 从50降低到10
					const abortController = new AbortController()

					// 流式处理：分批处理并立即插入
					for (let i = 0; i < contentChunks.length; i += batchSize) {
						if (abortController.signal.aborted) {
							throw new Error('Operation was aborted')
						}

						batchCount++
						const batchChunks = contentChunks.slice(i, Math.min(i + batchSize, contentChunks.length))
						const embeddedBatch: InsertVector[] = []

						const tasks = batchChunks.map((chunk) =>
							limit(async () => {
								if (abortController.signal.aborted) {
									throw new Error('Operation was aborted')
								}
								try {
									await backOff(
										async () => {
											// 在嵌入之前处理 markdown
											const cleanContent = removeMarkdown(chunk.content).replace(/\0/g, '')
											// 跳过清理后为空的内容
											if (!cleanContent || cleanContent.trim().length === 0) {
												return
											}

											const embedding = await embeddingModel.getEmbedding(cleanContent)
											const embeddedChunk = {
												path: chunk.path,
												mtime: chunk.mtime,
												content: cleanContent, // 使用清理后的内容
												embedding,
												metadata: chunk.metadata,
											}
											embeddedBatch.push(embeddedChunk)
										},
										{
											numOfAttempts: 3, // 减少重试次数
											startingDelay: 500, // 减少延迟
											timeMultiple: 1.5,
											jitter: 'full',
										},
									)
								} catch (error) {
									abortController.abort()
									throw error
								}
							}),
						)

						await Promise.all(tasks)

						// 立即插入当前批次
						if (embeddedBatch.length > 0) {
							await this.repository.insertVectors(embeddedBatch, embeddingModel)
							// 清理批次数据
							embeddedBatch.length = 0
						}

						// 定期内存清理
						await this.memoryCleanup(batchCount)
					}
				}
			} catch (error) {
				console.error('Error embedding chunks:', error)
			} finally {
				// 最终清理
				this.forceGarbageCollection()
			}
		} catch (error) {
			console.warn(`跳过文件 ${file.path}:`, error.message)
			new Notice(`跳过文件 ${file.name}: ${error.message}`)
		}
	}

	async DeleteFileVectorIndex(
		embeddingModel: EmbeddingModel,
		file: TFile
	) {
		await this.repository.deleteVectorsForSingleFile(file.path, embeddingModel)
	}

	private async cleanVectorsForDeletedFiles(
		embeddingModel: EmbeddingModel,
	) {
		const indexedFilePaths = await this.repository.getAllIndexedFilePaths(embeddingModel)
		const needToDelete = indexedFilePaths.filter(filePath => !this.app.vault.getAbstractFileByPath(filePath))
		if (needToDelete.length > 0) {
			await this.repository.deleteVectorsForMultipleFiles(
				needToDelete,
				embeddingModel,
			)
		}
	}

	private async getFilesToIndex({
		embeddingModel,
		excludePatterns,
		includePatterns,
		reindexAll,
	}: {
		embeddingModel: EmbeddingModel
		excludePatterns: string[]
		includePatterns: string[]
		reindexAll?: boolean
	}): Promise<TFile[]> {
		let filesToIndex = this.app.vault.getMarkdownFiles()
		console.log("get all vault files: ", filesToIndex.length)

		filesToIndex = filesToIndex.filter((file) => {
			return !excludePatterns.some((pattern) => minimatch(file.path, pattern))
		})

		if (includePatterns.length > 0) {
			filesToIndex = filesToIndex.filter((file) => {
				return includePatterns.some((pattern) => minimatch(file.path, pattern))
			})
		}

		if (reindexAll) {
			return filesToIndex
		}

		// 优化流程：使用数据库最大mtime来过滤需要更新的文件
		try {
			const maxMtime = await this.repository.getMaxMtime(embeddingModel)
			console.log("Database max mtime:", maxMtime)

			if (maxMtime === null) {
				// 数据库中没有任何向量，需要索引所有文件
				return filesToIndex
			}

			// 筛选出在数据库最后更新时间之后修改的文件
			return filesToIndex.filter((file) => {
				return file.stat.mtime > maxMtime
			})
		} catch (error) {
			console.error("Error getting max mtime from database:", error)
			return []
		}
	}

	private async getFilesToIndexInWorkspace({
		embeddingModel,
		workspace,
		excludePatterns,
		includePatterns,
		reindexAll,
	}: {
		embeddingModel: EmbeddingModel
		workspace: Workspace
		excludePatterns: string[]
		includePatterns: string[]
		reindexAll?: boolean
	}): Promise<TFile[]> {
		// 获取工作区中的所有文件
		const workspaceFiles = new Set<string>()

		if (workspace) {
			// 处理工作区中的文件夹和标签
			for (const item of workspace.content) {
				if (item.type === 'folder') {
					const folderPath = item.content
					
					// 获取文件夹下的所有文件
					const files = this.app.vault.getMarkdownFiles().filter(file => 
						file.path.startsWith(folderPath === '/' ? '' : folderPath + '/')
					)
					
					// 添加所有文件路径
					files.forEach(file => {
						workspaceFiles.add(file.path)
					})

				} else if (item.type === 'tag') {
					// 获取标签对应的所有文件
					const tagFiles = getFilesWithTag(item.content, this.app)
					
					tagFiles.forEach(filePath => {
						workspaceFiles.add(filePath)
					})
				}
			}
		}

		// 将路径转换为 TFile 对象
		let filesToIndex = Array.from(workspaceFiles)
			.map(path => this.app.vault.getFileByPath(path))
			.filter((file): file is TFile => file !== null && file instanceof TFile)

		console.log("get workspace files: ", filesToIndex.length)

		// 应用排除和包含模式
		filesToIndex = filesToIndex.filter((file) => {
			return !excludePatterns.some((pattern) => minimatch(file.path, pattern))
		})

		if (includePatterns.length > 0) {
			filesToIndex = filesToIndex.filter((file) => {
				return includePatterns.some((pattern) => minimatch(file.path, pattern))
			})
		}

		if (reindexAll) {
			return filesToIndex
		}

		// 优化流程：使用数据库最大mtime来过滤需要更新的文件
		try {
			const maxMtime = await this.repository.getMaxMtime(embeddingModel)
			console.log("Database max mtime:", maxMtime)

			if (maxMtime === null) {
				// 数据库中没有任何向量，需要索引所有文件
				return filesToIndex
			}

			// 筛选出在数据库最后更新时间之后修改的文件
			return filesToIndex.filter((file) => {
				return file.stat.mtime > maxMtime
			})
		} catch (error) {
			console.error("Error getting max mtime from database:", error)
			return []
		}
	}
}
