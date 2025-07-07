import { SerializedEditorState } from 'lexical'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

import { useApp } from '../../contexts/AppContext'
import { useRAG } from '../../contexts/RAGContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useTrans } from '../../contexts/TransContext'
import { Workspace } from '../../database/json/workspace/types'
import { WorkspaceManager } from '../../database/json/workspace/WorkspaceManager'
import { SelectVector } from '../../database/schema'
import { t } from '../../lang/helpers'
import { Mentionable } from '../../types/mentionable'
import { getFilesWithTag } from '../../utils/glob-utils'
import { openMarkdownFile } from '../../utils/obsidian'

import { ModelSelect } from './chat-input/ModelSelect'
import SearchInputWithActions, { SearchInputRef } from './chat-input/SearchInputWithActions'
import { editorStateToPlainText } from './chat-input/utils/editor-state-to-plain-text'

// 文件分组结果接口
interface FileGroup {
	path: string
	fileName: string
	maxSimilarity: number
	blocks: (Omit<SelectVector, 'embedding'> & { similarity: number })[]
}

// 洞察文件分组结果接口
interface InsightFileGroup {
	path: string
	fileName: string
	maxSimilarity: number
	insights: Array<{
		id: number
		insight: string
		insight_type: string
		similarity: number
		source_path: string
	}>
}

// 聚合文件分组结果接口
interface AllFileGroup {
	path: string
	fileName: string
	maxSimilarity: number
	blocks: (Omit<SelectVector, 'embedding'> & { similarity: number })[]
	insights: Array<{
		id: number
		insight: string
		insight_type: string
		similarity: number
		source_path: string
	}>
}

const SearchView = () => {
	const { getRAGEngine } = useRAG()
	const { getTransEngine } = useTrans()
	const app = useApp()
	const { settings } = useSettings()
	const searchInputRef = useRef<SearchInputRef>(null)

	// 工作区管理器
	const workspaceManager = useMemo(() => {
		return new WorkspaceManager(app)
	}, [app])
	const [searchResults, setSearchResults] = useState<(Omit<SelectVector, 'embedding'> & { similarity: number })[]>([])
	const [insightResults, setInsightResults] = useState<Array<{
		id: number
		insight: string
		insight_type: string
		similarity: number
		source_path: string
	}>>([])
	const [isSearching, setIsSearching] = useState(false)
	const [hasSearched, setHasSearched] = useState(false)
	const [searchMode, setSearchMode] = useState<'notes' | 'insights' | 'all'>('all') // 搜索模式：笔记、洞察或全部
	// 展开状态管理 - 默认全部展开
	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
	// 新增：mentionables 状态管理
	const [mentionables, setMentionables] = useState<Mentionable[]>([])
	const [searchEditorState, setSearchEditorState] = useState<SerializedEditorState | null>(null)

	// 统计信息状态
	const [statisticsInfo, setStatisticsInfo] = useState<{
		totalFiles: number
		totalChunks: number
	} | null>(null)
	const [isLoadingStats, setIsLoadingStats] = useState(false)

	// 工作区 RAG 向量初始化状态
	const [isInitializingRAG, setIsInitializingRAG] = useState(false)
	const [ragInitProgress, setRAGInitProgress] = useState<{
		type: 'indexing' | 'querying' | 'querying-done' | 'reading-mentionables' | 'reading-files'
		indexProgress?: {
			completedChunks: number
			totalChunks: number
			totalFiles: number
		}
		currentFile?: string
		totalFiles?: number
		completedFiles?: number
	} | null>(null)
	const [ragInitSuccess, setRAGInitSuccess] = useState<{
		show: boolean
		totalFiles?: number
		totalChunks?: number
		workspaceName?: string
	}>({ show: false })

	// 删除和确认对话框状态
	const [isDeleting, setIsDeleting] = useState(false)
	const [showRAGInitConfirm, setShowRAGInitConfirm] = useState(false)
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

	const handleSearch = useCallback(async (editorState?: SerializedEditorState) => {
		let searchTerm = ''

		if (editorState) {
			// 使用成熟的函数从 Lexical 编辑器状态中提取文本内容
			searchTerm = editorStateToPlainText(editorState).trim()
		}

		if (!searchTerm.trim()) {
			setSearchResults([])
			setInsightResults([])
			setHasSearched(false)
			return
		}

		setIsSearching(true)
		setHasSearched(true)

		try {
			// 获取当前工作区
			let currentWorkspace: Workspace | null = null
			if (settings.workspace && settings.workspace !== 'vault') {
				currentWorkspace = await workspaceManager.findByName(String(settings.workspace))
			}

			// 设置搜索范围信息（用于调试）
			let scopeDescription = ''
			if (currentWorkspace) {
				scopeDescription = `工作区: ${currentWorkspace.name}`
			} else {
				scopeDescription = '整个 Vault'
			}
			console.debug('搜索范围:', scopeDescription)

			// 构建搜索范围
			let scope: { files: string[], folders: string[] } | undefined
			if (currentWorkspace) {
				const folders: string[] = []
				const files: string[] = []

				// 处理工作区中的文件夹和标签
				for (const item of currentWorkspace.content) {
					if (item.type === 'folder') {
						folders.push(item.content)
					} else if (item.type === 'tag') {
						// 获取标签对应的所有文件
						const tagFiles = getFilesWithTag(item.content, app)
						files.push(...tagFiles)
					}
				}

				// 只有当有文件夹或文件时才设置 scope
				if (folders.length > 0 || files.length > 0) {
					scope = { files, folders }
				}
			}

			if (searchMode === 'notes') {
				// 搜索原始笔记
				const ragEngine = await getRAGEngine()
				const results = await ragEngine.processQuery({
					query: searchTerm,
					scope: scope,
					limit: 50,
				})

				setSearchResults(results)
				setInsightResults([])
			} else if (searchMode === 'insights') {
				// 搜索洞察
				const transEngine = await getTransEngine()
				const results = await transEngine.processQuery({
					query: searchTerm,
					scope: scope,
					limit: 50,
					minSimilarity: 0.3,
				})

				setInsightResults(results)
				setSearchResults([])
			} else {
				// 搜索全部：同时搜索原始笔记和洞察
				const ragEngine = await getRAGEngine()
				const transEngine = await getTransEngine()

				// 并行执行两个搜索
				const [notesResults, insightsResults] = await Promise.all([
					ragEngine.processQuery({
						query: searchTerm,
						scope: scope,
						limit: 25, // 每个类型限制25个结果
					}),
					transEngine.processQuery({
						query: searchTerm,
						scope: scope,
						limit: 25, // 每个类型限制25个结果
						minSimilarity: 0.3,
					})
				])

				setSearchResults(notesResults)
				setInsightResults(insightsResults)
			}
		} catch (error) {
			console.error('搜索失败:', error)
			setSearchResults([])
			setInsightResults([])
		} finally {
			setIsSearching(false)
		}
	}, [getRAGEngine, getTransEngine, settings, workspaceManager, app, searchMode])

	// 当搜索模式切换时，如果已经搜索过，重新执行搜索
	useEffect(() => {
		if (hasSearched && searchEditorState) {
			// 延迟执行避免状态更新冲突
			const timer = setTimeout(() => {
				handleSearch(searchEditorState)
			}, 100)
			return () => clearTimeout(timer)
		}
	}, [searchMode, handleSearch]) // 监听搜索模式变化

	// 加载统计信息
	const loadStatistics = useCallback(async () => {
		setIsLoadingStats(true)

		try {
			// 获取当前工作区
			let currentWorkspace: Workspace | null = null
			if (settings.workspace && settings.workspace !== 'vault') {
				currentWorkspace = await workspaceManager.findByName(String(settings.workspace))
			}

			const ragEngine = await getRAGEngine()
			const stats = await ragEngine.getWorkspaceStatistics(currentWorkspace)
			setStatisticsInfo(stats)

		} catch (error) {
			console.error('加载统计信息失败:', error)
			setStatisticsInfo({ totalFiles: 0, totalChunks: 0 })
		} finally {
			setIsLoadingStats(false)
		}
	}, [getRAGEngine, settings, workspaceManager])

	// 初始化工作区 RAG 向量
	const initializeWorkspaceRAG = useCallback(async () => {
		setIsInitializingRAG(true)
		setRAGInitProgress(null)

		try {
			// 获取当前工作区
			let currentWorkspace: Workspace | null = null
			if (settings.workspace && settings.workspace !== 'vault') {
				currentWorkspace = await workspaceManager.findByName(String(settings.workspace))
			}

			if (!currentWorkspace) {
				// 如果没有当前工作区，使用默认的 vault 工作区
				currentWorkspace = await workspaceManager.ensureDefaultVaultWorkspace()
			}

			const ragEngine = await getRAGEngine()

			// 使用新的 updateWorkspaceIndex 方法
			await ragEngine.updateWorkspaceIndex(
				currentWorkspace,
				{ reindexAll: true },
				(progress) => {
					setRAGInitProgress(progress as any)
				}
			)

			// 刷新统计信息
			await loadStatistics()

			// 显示成功消息
			console.log(`✅ 工作区 RAG 向量初始化完成: ${currentWorkspace.name}`)

			// 显示成功状态
			setRAGInitSuccess({
				show: true,
				totalFiles: ragInitProgress?.indexProgress?.totalFiles || 0,
				totalChunks: ragInitProgress?.indexProgress?.totalChunks || 0,
				workspaceName: currentWorkspace.name
			})

			// 3秒后自动隐藏成功消息
			setTimeout(() => {
				setRAGInitSuccess({ show: false })
			}, 5000)

		} catch (error) {
			console.error('工作区 RAG 向量初始化失败:', error)
			setRAGInitSuccess({ show: false })
		} finally {
			setIsInitializingRAG(false)
			setRAGInitProgress(null)
		}
	}, [getRAGEngine, settings, workspaceManager, loadStatistics])

	// 清除工作区索引
	const clearWorkspaceIndex = useCallback(async () => {
		setIsDeleting(true)

		try {
			// 获取当前工作区
			let currentWorkspace: Workspace | null = null
			if (settings.workspace && settings.workspace !== 'vault') {
				currentWorkspace = await workspaceManager.findByName(String(settings.workspace))
			}

			const ragEngine = await getRAGEngine()
			await ragEngine.clearWorkspaceIndex(currentWorkspace)

			// 刷新统计信息
			await loadStatistics()

			console.log('✅ 工作区索引清除完成')

		} catch (error) {
			console.error('清除工作区索引失败:', error)
		} finally {
			setIsDeleting(false)
		}
	}, [getRAGEngine, settings, workspaceManager, loadStatistics])

	// 组件加载时自动获取统计信息
	useEffect(() => {
		loadStatistics()
	}, [loadStatistics])

	// 确认初始化/更新 RAG 向量
	const handleInitWorkspaceRAG = useCallback(() => {
		setShowRAGInitConfirm(true)
	}, [])



	// 确认初始化 RAG 向量
	const confirmInitWorkspaceRAG = useCallback(async () => {
		setShowRAGInitConfirm(false)
		await initializeWorkspaceRAG()
	}, [initializeWorkspaceRAG])

	// 确认删除工作区索引
	const confirmDeleteWorkspaceIndex = useCallback(async () => {
		setShowDeleteConfirm(false)
		await clearWorkspaceIndex()
	}, [clearWorkspaceIndex])

	// 取消初始化确认
	const cancelRAGInitConfirm = useCallback(() => {
		setShowRAGInitConfirm(false)
	}, [])

	// 取消删除确认
	const cancelDeleteConfirm = useCallback(() => {
		setShowDeleteConfirm(false)
	}, [])

	const handleResultClick = (result: Omit<SelectVector, 'embedding'> & { similarity: number }) => {
		// 如果用户正在选择文本，不触发点击事件
		const selection = window.getSelection()
		if (selection && selection.toString().length > 0) {
			return
		}

		console.debug('🔍 [SearchView] 点击搜索结果:', {
			id: result.id,
			path: result.path,
			startLine: result.metadata?.startLine,
			endLine: result.metadata?.endLine,
			content: result.content?.substring(0, 100) + '...',
			similarity: result.similarity
		})

		// 检查路径是否存在
		if (!result.path) {
			console.error('❌ [SearchView] 文件路径为空')
			return
		}

		// 检查文件是否存在于vault中
		const file = app.vault.getFileByPath(result.path)
		if (!file) {
			console.error('❌ [SearchView] 在vault中找不到文件:', result.path)
			return
		}

		console.debug('✅ [SearchView] 文件存在，准备打开:', {
			file: file.path,
			startLine: result.metadata?.startLine
		})

		try {
			openMarkdownFile(app, result.path, result.metadata.startLine)
			console.debug('✅ [SearchView] 成功调用openMarkdownFile')
		} catch (error) {
			console.error('❌ [SearchView] 调用openMarkdownFile失败:', error)
		}
	}

	const toggleFileExpansion = (filePath: string) => {
		// 如果用户正在选择文本，不触发点击事件
		const selection = window.getSelection()
		if (selection && selection.toString().length > 0) {
			return
		}

		const newExpandedFiles = new Set(expandedFiles)
		if (newExpandedFiles.has(filePath)) {
			newExpandedFiles.delete(filePath)
		} else {
			newExpandedFiles.add(filePath)
		}
		setExpandedFiles(newExpandedFiles)
	}

	// 限制文本显示行数
	const truncateContent = (content: string, maxLines: number = 3) => {
		const lines = content.split('\n')
		if (lines.length <= maxLines) {
			return content
		}
		return lines.slice(0, maxLines).join('\n') + '...'
	}

	// 渲染markdown内容
	const renderMarkdownContent = (content: string, maxLines: number = 3) => {
		const truncatedContent = truncateContent(content, maxLines)
		return (
			<ReactMarkdown
				className="obsidian-markdown-content"
				components={{
					// 简化渲染，移除一些复杂元素
					h1: ({ children }) => <h4>{children}</h4>,
					h2: ({ children }) => <h4>{children}</h4>,
					h3: ({ children }) => <h4>{children}</h4>,
					h4: ({ children }) => <h4>{children}</h4>,
					h5: ({ children }) => <h5>{children}</h5>,
					h6: ({ children }) => <h5>{children}</h5>,
					// 移除图片显示，避免布局问题
					img: () => <span className="obsidian-image-placeholder">{t('semanticSearch.imagePlaceholder')}</span>,
					// 代码块样式
					code: ({ children, inline }: { children: React.ReactNode; inline?: boolean;[key: string]: unknown }) => {
						if (inline) {
							return <code className="obsidian-inline-code">{children}</code>
						}
						return <pre className="obsidian-code-block"><code>{children}</code></pre>
					},
					// 链接样式
					a: ({ href, children }) => (
						<span className="obsidian-link" title={href}>{children}</span>
					),
				}}
			>
				{truncatedContent}
			</ReactMarkdown>
		)
	}

	// 按文件分组并排序 - 原始笔记
	const groupedResults = useMemo(() => {
		if (!searchResults.length) return []

		// 按文件路径分组
		const fileGroups = new Map<string, FileGroup>()

		searchResults.forEach(result => {
			const filePath = result.path
			const fileName = filePath.split('/').pop() || filePath

			if (!fileGroups.has(filePath)) {
				fileGroups.set(filePath, {
					path: filePath,
					fileName,
					maxSimilarity: result.similarity,
					blocks: []
				})
			}

			const group = fileGroups.get(filePath)
			if (group) {
				group.blocks.push(result)
				// 更新最高相似度
				if (result.similarity > group.maxSimilarity) {
					group.maxSimilarity = result.similarity
				}
			}
		})

		// 对每个文件内的块按相似度排序
		fileGroups.forEach(group => {
			group.blocks.sort((a, b) => b.similarity - a.similarity)
		})

		// 将文件按最高相似度排序
		return Array.from(fileGroups.values()).sort((a, b) => b.maxSimilarity - a.maxSimilarity)
	}, [searchResults])

	// 按文件分组并排序 - 洞察
	const insightGroupedResults = useMemo(() => {
		if (!insightResults.length) return []

		// 按文件路径分组
		const fileGroups = new Map<string, InsightFileGroup>()

		insightResults.forEach(result => {
			const filePath = result.source_path
			const fileName = filePath.split('/').pop() || filePath

			if (!fileGroups.has(filePath)) {
				fileGroups.set(filePath, {
					path: filePath,
					fileName,
					maxSimilarity: result.similarity,
					insights: []
				})
			}

			const group = fileGroups.get(filePath)
			if (group) {
				group.insights.push(result)
				// 更新最高相似度
				if (result.similarity > group.maxSimilarity) {
					group.maxSimilarity = result.similarity
				}
			}
		})

		// 对每个文件内的洞察按相似度排序
		fileGroups.forEach(group => {
			group.insights.sort((a, b) => b.similarity - a.similarity)
		})

		// 将文件按最高相似度排序
		return Array.from(fileGroups.values()).sort((a, b) => b.maxSimilarity - a.maxSimilarity)
	}, [insightResults])

	// 按文件分组并排序 - 全部聚合
	const allGroupedResults = useMemo(() => {
		if (!searchResults.length && !insightResults.length) return []

		// 合并所有文件路径
		const allFilePaths = new Set<string>()

		// 从笔记结果中收集文件路径
		searchResults.forEach(result => {
			allFilePaths.add(result.path)
		})

		// 从洞察结果中收集文件路径
		insightResults.forEach(result => {
			allFilePaths.add(result.source_path)
		})

		// 按文件路径分组
		const fileGroups = new Map<string, AllFileGroup>()

		// 处理每个文件
		Array.from(allFilePaths).forEach(filePath => {
			const fileName = filePath.split('/').pop() || filePath

			// 获取该文件的笔记块
			const fileBlocks = searchResults.filter(result => result.path === filePath)

			// 获取该文件的洞察
			const fileInsights = insightResults.filter(result => result.source_path === filePath)

			// 计算该文件的最高相似度
			const blockMaxSimilarity = fileBlocks.length > 0 ? Math.max(...fileBlocks.map(b => b.similarity)) : 0
			const insightMaxSimilarity = fileInsights.length > 0 ? Math.max(...fileInsights.map(i => i.similarity)) : 0
			const maxSimilarity = Math.max(blockMaxSimilarity, insightMaxSimilarity)

			if (fileBlocks.length > 0 || fileInsights.length > 0) {
				// 对块和洞察分别按相似度排序
				fileBlocks.sort((a, b) => b.similarity - a.similarity)
				fileInsights.sort((a, b) => b.similarity - a.similarity)

				fileGroups.set(filePath, {
					path: filePath,
					fileName,
					maxSimilarity,
					blocks: fileBlocks,
					insights: fileInsights
				})
			}
		})

		// 将文件按最高相似度排序
		return Array.from(fileGroups.values()).sort((a, b) => b.maxSimilarity - a.maxSimilarity)
	}, [searchResults, insightResults])

	const totalBlocks = searchResults.length
	const totalFiles = groupedResults.length
	const totalAllFiles = allGroupedResults.length

	return (
		<div className="obsidian-search-container">
			{/* 头部信息 */}
			<div className="obsidian-search-header-wrapper">
				<div className="obsidian-search-title">
					<h3>{t('semanticSearch.title')}</h3>
				</div>

				{/* 统计信息 */}
				<div className="obsidian-search-stats">
					{!isLoadingStats && statisticsInfo && (
						<div className="obsidian-search-stats-overview">
							<div className="obsidian-search-stats-main">
								<span className="obsidian-search-stats-number">{statisticsInfo.totalChunks}</span>
								<span className="obsidian-search-stats-label">{t('semanticSearch.vectorBlocks')}</span>
							</div>
							<div className="obsidian-search-stats-breakdown">
								<div className="obsidian-search-stats-item">
									<span className="obsidian-search-stats-item-icon">📄</span>
									<span className="obsidian-search-stats-item-value">{statisticsInfo.totalFiles}</span>
									<span className="obsidian-search-stats-item-label">{t('semanticSearch.files')}</span>
								</div>
							</div>
						</div>
					)}
					<div className="infio-search-model-info">
						<div className="infio-search-model-row">
							<span className="infio-search-model-label">{t('semanticSearch.embeddingModel')}</span>
							<ModelSelect modelType="embedding" />
						</div>
						<div className="obsidian-search-actions">
							<button
								onClick={handleInitWorkspaceRAG}
								disabled={isInitializingRAG || isDeleting || isSearching}
								className="obsidian-search-init-btn"
								title={statisticsInfo && (statisticsInfo.totalFiles > 0 || statisticsInfo.totalChunks > 0) ? t('semanticSearch.updateIndex') : t('semanticSearch.initializeIndex')}
							>
								{isInitializingRAG ? t('semanticSearch.initializing') : (statisticsInfo && (statisticsInfo.totalFiles > 0 || statisticsInfo.totalChunks > 0) ? t('semanticSearch.updateIndex') : t('semanticSearch.initializeIndex'))}
							</button>

						</div>
					</div>
				</div>

				{/* 索引进度 */}
				{isInitializingRAG && (
					<div className="obsidian-rag-initializing">
						<div className="obsidian-rag-init-header">
							<h4>{t('semanticSearch.initializingWorkspace')}</h4>
							<p>{t('semanticSearch.initializingDescription')}</p>
						</div>
						{ragInitProgress && ragInitProgress.type === 'indexing' && ragInitProgress.indexProgress && (
							<div className="obsidian-rag-progress">
								<div className="obsidian-rag-progress-info">
									<span className="obsidian-rag-progress-stage">{t('semanticSearch.buildingVectorIndex')}</span>
									<span className="obsidian-rag-progress-counter">
										{ragInitProgress.indexProgress.completedChunks} / {ragInitProgress.indexProgress.totalChunks} {t('semanticSearch.blocks')}
									</span>
								</div>
								<div className="obsidian-rag-progress-bar">
									<div
										className="obsidian-rag-progress-fill"
										style={{
											width: `${(ragInitProgress.indexProgress.completedChunks / Math.max(ragInitProgress.indexProgress.totalChunks, 1)) * 100}%`
										}}
									></div>
								</div>
								<div className="obsidian-rag-progress-details">
									<div className="obsidian-rag-progress-files">
										{t('semanticSearch.totalFiles', { count: ragInitProgress.indexProgress.totalFiles })}
									</div>
									<div className="obsidian-rag-progress-percentage">
										{Math.round((ragInitProgress.indexProgress.completedChunks / Math.max(ragInitProgress.indexProgress.totalChunks, 1)) * 100)}%
									</div>
								</div>
							</div>
						)}
					</div>
				)}

				{/* RAG 初始化成功消息 */}
				{ragInitSuccess.show && (
					<div className="obsidian-rag-success">
						<div className="obsidian-rag-success-content">
							<span className="obsidian-rag-success-icon">✅</span>
							<div className="obsidian-rag-success-text">
															<span className="obsidian-rag-success-title">
								{t('semanticSearch.initializationComplete', { workspaceName: ragInitSuccess.workspaceName })}
							</span>
							</div>
							<button
								className="obsidian-rag-success-close"
								onClick={() => setRAGInitSuccess({ show: false })}
							>
								×
							</button>
						</div>
					</div>
				)}

				{/* 搜索输入框 */}
				<div className="obsidian-search-input-section">
					<SearchInputWithActions
						ref={searchInputRef}
						initialSerializedEditorState={searchEditorState}
						onChange={setSearchEditorState}
						onSubmit={handleSearch}
						mentionables={mentionables}
						setMentionables={setMentionables}
						placeholder={t('semanticSearch.searchPlaceholder')}
						autoFocus={true}
						disabled={isSearching}
						searchMode={searchMode}
						onSearchModeChange={setSearchMode}
					/>
				</div>
			</div>

			{/* 索引统计 */}
			{hasSearched && !isSearching && (
				<div className="obsidian-search-stats">
					<div className="obsidian-search-stats-line">
						{searchMode === 'notes' ? (
							t('semanticSearch.stats.filesAndBlocks', { files: totalFiles, blocks: totalBlocks })
						) : searchMode === 'insights' ? (
							t('semanticSearch.stats.filesAndInsights', { files: insightGroupedResults.length, insights: insightResults.length })
						) : (
							t('semanticSearch.stats.filesBlocksAndInsights', { files: totalAllFiles, blocks: totalBlocks, insights: insightResults.length })
						)}
					</div>
				</div>
			)}
			{/* 确认删除对话框 */}
			{showDeleteConfirm && (
				<div className="obsidian-confirm-dialog-overlay">
					<div className="obsidian-confirm-dialog">
						<div className="obsidian-confirm-dialog-header">
							<h3>{t('semanticSearch.deleteConfirm.title')}</h3>
						</div>
						<div className="obsidian-confirm-dialog-body">
							<p>
								{t('semanticSearch.deleteConfirm.message')}
							</p>
							<p className="obsidian-confirm-dialog-warning">
								{t('semanticSearch.deleteConfirm.warning')}
							</p>
							<div className="obsidian-confirm-dialog-scope">
								<strong>{t('semanticSearch.deleteConfirm.workspaceLabel')}</strong> {settings.workspace === 'vault' ? t('semanticSearch.deleteConfirm.entireVault') : settings.workspace}
							</div>
						</div>
						<div className="obsidian-confirm-dialog-footer">
							<button
								onClick={cancelDeleteConfirm}
								className="obsidian-confirm-dialog-cancel-btn"
							>
								{t('semanticSearch.deleteConfirm.cancel')}
							</button>
							<button
								onClick={confirmDeleteWorkspaceIndex}
								className="obsidian-confirm-dialog-confirm-btn"
							>
								{t('semanticSearch.deleteConfirm.confirm')}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* 确认初始化对话框 */}
			{showRAGInitConfirm && (
				<div className="obsidian-confirm-dialog-overlay">
					<div className="obsidian-confirm-dialog">
						<div className="obsidian-confirm-dialog-header">
							<h3>{statisticsInfo && (statisticsInfo.totalFiles > 0 || statisticsInfo.totalChunks > 0) ? t('semanticSearch.initConfirm.updateTitle') : t('semanticSearch.initConfirm.initTitle')}</h3>
						</div>
						<div className="obsidian-confirm-dialog-body">
							<p>
								{statisticsInfo && (statisticsInfo.totalFiles > 0 || statisticsInfo.totalChunks > 0)
									? t('semanticSearch.initConfirm.updateMessage')
									: t('semanticSearch.initConfirm.initMessage')
								}
							</p>
							<div className="obsidian-confirm-dialog-info">
								<div className="obsidian-confirm-dialog-info-item">
									<strong>{t('semanticSearch.initConfirm.embeddingModelLabel')}</strong>
									<span className="obsidian-confirm-dialog-model">
										{settings.embeddingModelId}
									</span>
								</div>
								<div className="obsidian-confirm-dialog-info-item">
									<strong>{t('semanticSearch.initConfirm.workspaceLabel')}</strong>
									<span className="obsidian-confirm-dialog-workspace">
										{settings.workspace === 'vault' ? t('semanticSearch.initConfirm.entireVault') : settings.workspace}
									</span>
								</div>
							</div>
							<p className="obsidian-confirm-dialog-warning">
								{t('semanticSearch.initConfirm.warning')}
							</p>
						</div>
						<div className="obsidian-confirm-dialog-footer">
							<button
								onClick={cancelRAGInitConfirm}
								className="obsidian-confirm-dialog-cancel-btn"
							>
								{t('semanticSearch.initConfirm.cancel')}
							</button>
							<button
								onClick={confirmInitWorkspaceRAG}
								className="obsidian-confirm-dialog-confirm-btn"
							>
								{statisticsInfo && (statisticsInfo.totalFiles > 0 || statisticsInfo.totalChunks > 0) ? t('semanticSearch.initConfirm.startUpdate') : t('semanticSearch.initConfirm.startInit')}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* 搜索进度 */}
			{isSearching && (
				<div className="obsidian-search-loading">
					{t('semanticSearch.searching')}
				</div>
			)}

			{/* 搜索结果 */}
			<div className="obsidian-search-results">
				{searchMode === 'notes' ? (
					// 原始笔记搜索结果
					!isSearching && groupedResults.length > 0 && (
						<div className="obsidian-results-list">
							{groupedResults.map((fileGroup) => (
								<div key={fileGroup.path} className="obsidian-file-group">
									{/* 文件头部 */}
									<div
										className="obsidian-file-header"
										onClick={() => toggleFileExpansion(fileGroup.path)}
									>
										<div className="obsidian-file-header-content">
											<div className="obsidian-file-header-top">
												<div className="obsidian-file-header-left">
													{expandedFiles.has(fileGroup.path) ? (
														<ChevronDown size={16} className="obsidian-expand-icon" />
													) : (
														<ChevronRight size={16} className="obsidian-expand-icon" />
													)}
													<span className="obsidian-file-name">{fileGroup.fileName}</span>
												</div>
											</div>
											<div className="obsidian-file-path-row">
												<span className="obsidian-file-path">{fileGroup.path}</span>
											</div>
										</div>
									</div>

									{/* 文件块列表 */}
									{expandedFiles.has(fileGroup.path) && (
										<div className="obsidian-file-blocks">
											{fileGroup.blocks.map((result, blockIndex) => (
												<div
													key={result.id}
													className="obsidian-result-item"
													onClick={() => handleResultClick(result)}
												>
													<div className="obsidian-result-header">
														<span className="obsidian-result-index">{blockIndex + 1}</span>
														<span className="obsidian-result-location">
															L{result.metadata.startLine}-{result.metadata.endLine}
														</span>
														<span className="obsidian-result-similarity">
															{result.similarity.toFixed(3)}
														</span>
													</div>
													<div className="obsidian-result-content">
														{renderMarkdownContent(result.content)}
													</div>
												</div>
											))}
										</div>
									)}
								</div>
							))}
						</div>
					)
				) : searchMode === 'insights' ? (
					// AI 洞察搜索结果
					!isSearching && insightGroupedResults.length > 0 && (
						<div className="obsidian-results-list">
							{insightGroupedResults.map((fileGroup) => (
								<div key={fileGroup.path} className="obsidian-file-group">
									{/* 文件头部 */}
									<div
										className="obsidian-file-header"
										onClick={() => toggleFileExpansion(fileGroup.path)}
									>
										<div className="obsidian-file-header-content">
											<div className="obsidian-file-header-top">
												<div className="obsidian-file-header-left">
													{expandedFiles.has(fileGroup.path) ? (
														<ChevronDown size={16} className="obsidian-expand-icon" />
													) : (
														<ChevronRight size={16} className="obsidian-expand-icon" />
													)}
													<span className="obsidian-file-name">{fileGroup.fileName}</span>
												</div>
											</div>
											<div className="obsidian-file-path-row">
												<span className="obsidian-file-path">{fileGroup.path}</span>
											</div>
										</div>
									</div>

									{/* 洞察列表 */}
									{expandedFiles.has(fileGroup.path) && (
										<div className="obsidian-file-blocks">
											{fileGroup.insights.map((insight, insightIndex) => (
												<div
													key={insight.id}
													className="obsidian-result-item"
												>
													<div className="obsidian-result-header">
														<span className="obsidian-result-index">{insightIndex + 1}</span>
														<span className="obsidian-result-insight-type">
															{insight.insight_type.toUpperCase()}
														</span>
														<span className="obsidian-result-similarity">
															{insight.similarity.toFixed(3)}
														</span>
													</div>
													<div className="obsidian-result-content">
														<div className="obsidian-insight-content">
															{insight.insight}
														</div>
													</div>
												</div>
											))}
										</div>
									)}
								</div>
							))}
						</div>
					)
				) : (
					// 全部搜索结果：按文件聚合显示原始笔记和洞察
					!isSearching && allGroupedResults.length > 0 && (
						<div className="obsidian-results-list">
							{allGroupedResults.map((fileGroup) => (
								<div key={fileGroup.path} className="obsidian-file-group">
									{/* 文件头部 */}
									<div
										className="obsidian-file-header"
										onClick={() => toggleFileExpansion(fileGroup.path)}
									>
										<div className="obsidian-file-header-content">
											<div className="obsidian-file-header-top">
												<div className="obsidian-file-header-left">
													{expandedFiles.has(fileGroup.path) ? (
														<ChevronDown size={16} className="obsidian-expand-icon" />
													) : (
														<ChevronRight size={16} className="obsidian-expand-icon" />
													)}
													<span className="obsidian-file-name">{fileGroup.fileName}</span>
												</div>
											</div>
											<div className="obsidian-file-path-row">
												<span className="obsidian-file-path">{fileGroup.path}</span>
											</div>
										</div>
									</div>

									{/* 文件内容：混合显示笔记块和洞察 */}
									{expandedFiles.has(fileGroup.path) && (
										<div className="obsidian-file-blocks">
											{/* AI 洞察 */}
											{fileGroup.insights.map((insight, insightIndex) => (
												<div
													key={`insight-${insight.id}`}
													className="obsidian-result-item obsidian-result-insight"
												>
													<div className="obsidian-result-header">
														<span className="obsidian-result-index">{insightIndex + 1}</span>
														<span className="obsidian-result-insight-type">
															{insight.insight_type.toUpperCase()}
														</span>
														<span className="obsidian-result-similarity">
															{insight.similarity.toFixed(3)}
														</span>
													</div>
													<div className="obsidian-result-content">
														<div className="obsidian-insight-content">
															{insight.insight}
														</div>
													</div>
												</div>
											))}
											{/* 原始笔记块 */}
											{fileGroup.blocks.map((result, blockIndex) => (
												<div
													key={`block-${result.id}`}
													className="obsidian-result-item obsidian-result-block"
													onClick={() => handleResultClick(result)}
												>
													<div className="obsidian-result-header">
														<span className="obsidian-result-index">{blockIndex + 1}</span>
														<span className="obsidian-result-location">
															L{result.metadata.startLine}-{result.metadata.endLine}
														</span>
														<span className="obsidian-result-similarity">
															{result.similarity.toFixed(3)}
														</span>
													</div>
													<div className="obsidian-result-content">
														{renderMarkdownContent(result.content)}
													</div>
												</div>
											))}
										</div>
									)}
								</div>
							))}
						</div>
					)
				)}

				{!isSearching && hasSearched && (
					(searchMode === 'notes' && groupedResults.length === 0) ||
					(searchMode === 'insights' && insightGroupedResults.length === 0) ||
					(searchMode === 'all' && allGroupedResults.length === 0)
				) && (
						<div className="obsidian-no-results">
							<p>{t('semanticSearch.noResults')}</p>
						</div>
					)}
			</div>

			{/* 样式 */}
			<style>
				{`
				.infio-search-model-info {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: var(--size-4-3);
				}

				.infio-search-model-row {
					display: flex;
					align-items: center;
					gap: var(--size-2-2);
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					padding: var(--size-2-2);
				}

				.infio-search-model-label {
					font-size: var(--font-ui-small);
					color: var(--text-muted);
					font-weight: var(--font-medium);
				}

				.infio-search-model-value {
					font-size: var(--font-ui-small);
					color: var(--text-accent);
					font-weight: 600;
					font-family: var(--font-monospace);
				}

				.obsidian-search-container {
					display: flex;
					flex-direction: column;
					height: 100%;
					font-family: var(--font-interface);
				}

				.obsidian-search-header-wrapper {
					padding: 12px;
					border-bottom: 1px solid var(--background-modifier-border);
				}

				.obsidian-search-title {
					display: flex;
					align-items: center;
					justify-content: space-between;
					margin-bottom: 12px;
				}

				.obsidian-search-title h3 {
					margin: 0;
					color: var(--text-normal);
					font-size: var(--font-ui-large);
					font-weight: 600;
				}

				.obsidian-search-actions {
					display: flex;
					gap: 8px;
				}

				.obsidian-search-init-btn {
					padding: 6px 12px;
					background-color: var(--interactive-accent);
					border: none;
					border-radius: var(--radius-s);
					color: var(--text-on-accent);
					font-size: var(--font-ui-small);
					cursor: pointer;
					transition: background-color 0.2s ease;
					font-weight: 500;
				}

				.obsidian-search-init-btn:hover:not(:disabled) {
					background-color: var(--interactive-accent-hover);
				}

				.obsidian-search-init-btn:disabled {
					opacity: 0.6;
					cursor: not-allowed;
				}

				.obsidian-search-delete-btn {
					padding: 6px 12px;
					background-color: #dc3545;
					border: none;
					border-radius: var(--radius-s);
					color: white;
					font-size: var(--font-ui-small);
					cursor: pointer;
					transition: background-color 0.2s ease;
					font-weight: 500;
				}

				.obsidian-search-delete-btn:hover:not(:disabled) {
					background-color: #c82333;
				}

				.obsidian-search-delete-btn:disabled {
					opacity: 0.6;
					cursor: not-allowed;
				}

				.obsidian-search-stats {
					background-color: var(--background-secondary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-m);
					padding: 12px;
					margin-bottom: 12px;
				}

				.obsidian-search-stats-overview {
					display: flex;
					align-items: center;
					justify-content: space-between;
					margin-bottom: 8px;
				}

				.obsidian-search-stats-main {
					display: flex;
					align-items: baseline;
					gap: 6px;
				}

				.obsidian-search-stats-number {
					font-size: var(--font-ui-large);
					font-weight: 700;
					color: var(--text-accent);
					font-family: var(--font-monospace);
				}

				.obsidian-search-stats-label {
					font-size: var(--font-ui-medium);
					color: var(--text-normal);
					font-weight: 500;
				}

				.obsidian-search-stats-breakdown {
					flex: 1;
					display: flex;
					justify-content: flex-end;
				}

				.obsidian-search-stats-item {
					display: flex;
					align-items: center;
					gap: 4px;
					padding: 4px 8px;
					background-color: var(--background-modifier-border);
					border-radius: var(--radius-s);
				}

				.obsidian-search-stats-item-icon {
					font-size: 12px;
					line-height: 1;
				}

				.obsidian-search-stats-item-value {
					font-size: var(--font-ui-small);
					font-weight: 600;
					color: var(--text-normal);
					font-family: var(--font-monospace);
				}

				.obsidian-search-stats-item-label {
					font-size: var(--font-ui-smaller);
					color: var(--text-muted);
				}

				.obsidian-search-scope {
					display: flex;
					align-items: center;
					gap: 6px;
					padding: 6px 8px;
					background-color: var(--background-modifier-border-hover);
					border-radius: var(--radius-s);
				}

				.obsidian-search-scope-label {
					font-size: var(--font-ui-smaller);
					color: var(--text-muted);
					font-weight: 500;
				}

				.obsidian-search-scope-value {
					font-size: var(--font-ui-smaller);
					color: var(--text-accent);
					font-weight: 600;
				}

				.obsidian-search-input-section {
					/* padding 由父元素控制 */
				}



				.obsidian-search-stats {
					padding: 8px 12px;
					font-size: var(--font-ui-small);
					color: var(--text-muted);
				}

				.obsidian-search-stats-line {
					margin-bottom: 2px;
				}

				.obsidian-search-scope {
					font-size: var(--font-ui-smaller);
					color: var(--text-accent);
					font-weight: 500;
				}

				.obsidian-search-loading {
					padding: 20px;
					text-align: center;
					color: var(--text-muted);
					font-size: var(--font-ui-medium);
				}

				.obsidian-search-results {
					flex: 1;
					overflow-y: auto;
				}

				.obsidian-results-list {
					display: flex;
					flex-direction: column;
				}

				.obsidian-file-group {
					border-bottom: 1px solid var(--background-modifier-border);
				}

				.obsidian-file-header {
					padding: 12px;
					background-color: var(--background-secondary);
					cursor: pointer;
					transition: background-color 0.1s ease;
					border-bottom: 1px solid var(--background-modifier-border);
				}

				.obsidian-file-header:hover {
					background-color: var(--background-modifier-hover);
				}

				.obsidian-file-header-content {
					display: flex;
					flex-direction: column;
					gap: 4px;
				}

				.obsidian-file-header-top {
					display: flex;
					align-items: center;
					justify-content: space-between;
				}

				.obsidian-file-header-left {
					display: flex;
					align-items: center;
					gap: 8px;
					flex: 1;
					min-width: 0;
				}

				.obsidian-file-header-right {
					display: flex;
					align-items: center;
					gap: 12px;
					flex-shrink: 0;
				}

				.obsidian-file-path-row {
					margin-left: 24px;
				}

				.obsidian-expand-icon {
					color: var(--text-muted);
					flex-shrink: 0;
				}

				.obsidian-file-index {
					color: var(--text-muted);
					font-size: var(--font-ui-small);
					font-weight: 500;
					min-width: 20px;
					flex-shrink: 0;
				}

				.obsidian-file-name {
					color: var(--text-normal);
					font-size: var(--font-ui-medium);
					font-weight: 500;
					flex-shrink: 0;
					user-select: text;
					cursor: text;
				}

				.obsidian-file-path {
					color: var(--text-muted);
					font-size: var(--font-ui-smaller);
					font-family: var(--font-monospace);
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				.obsidian-file-blocks {
					color: var(--text-muted);
					font-size: var(--font-ui-small);
				}

				.obsidian-file-similarity {
					color: var(--text-muted);
					font-size: var(--font-ui-smaller);
					font-family: var(--font-monospace);
				}

				.obsidian-file-blocks {
					background-color: var(--background-primary);
				}

				.obsidian-result-item {
					padding: 12px 12px 12px 32px;
					border-bottom: 1px solid var(--background-modifier-border-focus);
					cursor: pointer;
					transition: background-color 0.1s ease;
				}

				.obsidian-result-item:hover {
					background-color: var(--background-modifier-hover);
				}

				.obsidian-result-item:last-child {
					border-bottom: none;
				}

				.obsidian-result-header {
					display: flex;
					align-items: center;
					margin-bottom: 6px;
					gap: 8px;
				}

				.obsidian-result-index {
					color: var(--text-muted);
					font-size: var(--font-ui-small);
					font-weight: 500;
					min-width: 16px;
					flex-shrink: 0;
				}

				.obsidian-result-location {
					color: var(--text-muted);
					font-size: var(--font-ui-smaller);
					font-family: var(--font-monospace);
					flex-grow: 1;
				}

				.obsidian-result-similarity {
					color: var(--text-muted);
					font-size: var(--font-ui-smaller);
					font-family: var(--font-monospace);
					flex-shrink: 0;
				}

				.obsidian-result-content {
					color: var(--text-normal);
					font-size: var(--font-ui-medium);
					line-height: 1.4;
					word-wrap: break-word;
					user-select: text;
					cursor: text;
				}

				/* Markdown 渲染样式 */
				.obsidian-markdown-content {
					color: var(--text-normal);
					font-size: var(--font-ui-medium);
					line-height: 1.4;
					user-select: text;
					cursor: text;
				}

				.obsidian-markdown-content h4,
				.obsidian-markdown-content h5 {
					margin: 4px 0;
					color: var(--text-normal);
					font-weight: 600;
				}

				.obsidian-markdown-content p {
					margin: 4px 0;
				}

				.obsidian-markdown-content ul,
				.obsidian-markdown-content ol {
					margin: 4px 0;
					padding-left: 16px;
				}

				.obsidian-markdown-content li {
					margin: 2px 0;
				}

				.obsidian-inline-code {
					background-color: var(--background-modifier-border);
					color: var(--text-accent);
					padding: 2px 4px;
					border-radius: var(--radius-s);
					font-family: var(--font-monospace);
					font-size: 0.9em;
				}

				.obsidian-code-block {
					background-color: var(--background-modifier-border);
					padding: 8px;
					border-radius: var(--radius-s);
					margin: 4px 0;
					overflow-x: auto;
				}

				.obsidian-code-block code {
					font-family: var(--font-monospace);
					font-size: var(--font-ui-smaller);
					color: var(--text-normal);
				}

				.obsidian-link {
					color: var(--text-accent);
					text-decoration: underline;
					cursor: pointer;
				}

				.obsidian-image-placeholder {
					color: var(--text-muted);
					font-style: italic;
					background-color: var(--background-modifier-border);
					padding: 2px 6px;
					border-radius: var(--radius-s);
					font-size: var(--font-ui-smaller);
				}

				.obsidian-markdown-content blockquote {
					border-left: 3px solid var(--text-accent);
					padding-left: 12px;
					margin: 4px 0;
					color: var(--text-muted);
					font-style: italic;
				}

				.obsidian-markdown-content strong {
					font-weight: 600;
					color: var(--text-normal);
				}

				.obsidian-markdown-content em {
					font-style: italic;
					color: var(--text-muted);
				}

				.obsidian-no-results {
					padding: 40px 20px;
					text-align: center;
					color: var(--text-muted);
				}

				.obsidian-no-results p {
					margin: 0;
					font-size: var(--font-ui-medium);
				}

				/* 洞察结果特殊样式 */
				.obsidian-result-insight-type {
					color: var(--text-accent);
					font-size: var(--font-ui-smaller);
					font-family: var(--font-monospace);
					font-weight: 600;
					background-color: var(--background-modifier-border);
					padding: 2px 6px;
					border-radius: var(--radius-s);
					flex-grow: 1;
				}

				.obsidian-insight-content {
					color: var(--text-normal);
					font-size: var(--font-ui-medium);
					line-height: 1.5;
					white-space: pre-wrap;
					user-select: text;
					cursor: text;
				}

				/* 全部搜索结果分组样式 */
				.obsidian-result-section {
					margin-bottom: 20px;
				}

				.obsidian-result-section-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 12px 16px;
					background-color: var(--background-modifier-border);
					border-radius: var(--radius-s);
					margin-bottom: 8px;
				}

				.obsidian-result-section-title {
					color: var(--text-normal);
					font-size: var(--font-ui-medium);
					font-weight: 600;
				}

				.obsidian-result-section-count {
					color: var(--text-muted);
					font-size: var(--font-ui-small);
					font-family: var(--font-monospace);
				}

				/* 全部模式下的类型徽章样式 */
				.obsidian-result-type-badge {
					padding: 2px 6px;
					border-radius: var(--radius-s);
					font-size: var(--font-ui-smaller);
					font-weight: 600;
					font-family: var(--font-monospace);
					margin-right: 8px;
					flex-shrink: 0;
				}

				.obsidian-result-type-note {
					background-color: var(--color-blue-light, #e3f2fd);
					color: var(--color-blue-dark, #1976d2);
				}

				.obsidian-result-type-insight {
					background-color: var(--color-amber-light, #fff3e0);
					color: var(--color-amber-dark, #f57c00);
				}

				/* 全部模式下的结果项样式 */
				.obsidian-result-block {
					border-left: 3px solid var(--color-blue, #2196f3);
				}

				.obsidian-result-insight {
					border-left: 3px solid var(--color-amber, #ff9800);
				}

				/* RAG 初始化进度样式 */
				.obsidian-rag-initializing {
					padding: 12px;
					background-color: var(--background-secondary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-m);
					margin-bottom: 12px;
				}

				.obsidian-rag-init-header {
					text-align: center;
					margin-bottom: 16px;
				}

				.obsidian-rag-init-header h4 {
					margin: 0 0 8px 0;
					color: var(--text-normal);
					font-size: var(--font-ui-medium);
					font-weight: 600;
				}

				.obsidian-rag-init-header p {
					margin: 0;
					color: var(--text-muted);
					font-size: var(--font-ui-small);
				}

				.obsidian-rag-progress {
					background-color: var(--background-primary);
					padding: 12px;
					border-radius: var(--radius-s);
					border: 1px solid var(--background-modifier-border);
				}

				.obsidian-rag-progress-info {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 8px;
				}

				.obsidian-rag-progress-stage {
					color: var(--text-normal);
					font-size: var(--font-ui-small);
					font-weight: 500;
				}

				.obsidian-rag-progress-counter {
					color: var(--text-muted);
					font-size: var(--font-ui-small);
					font-family: var(--font-monospace);
				}

				.obsidian-rag-progress-bar {
					width: 100%;
					height: 6px;
					background-color: var(--background-modifier-border);
					border-radius: 3px;
					overflow: hidden;
					margin-bottom: 8px;
				}

				.obsidian-rag-progress-fill {
					height: 100%;
					background-color: var(--interactive-accent);
					border-radius: 3px;
					transition: width 0.3s ease;
				}

				.obsidian-rag-progress-details {
					display: flex;
					justify-content: space-between;
					align-items: center;
				}

				.obsidian-rag-progress-files {
					color: var(--text-normal);
					font-size: var(--font-ui-small);
					font-weight: 500;
				}

				.obsidian-rag-progress-percentage {
					color: var(--text-accent);
					font-size: var(--font-ui-small);
					font-weight: 600;
					font-family: var(--font-monospace);
				}

				/* RAG 初始化成功样式 */
				.obsidian-rag-success {
					background-color: var(--background-secondary);
					border: 1px solid var(--color-green, #28a745);
					border-radius: var(--radius-m);
					margin-bottom: 12px;
					animation: slideInFromTop 0.3s ease-out;
				}

				.obsidian-rag-success-content {
					display: flex;
					align-items: center;
					gap: 12px;
					padding: 12px 16px;
				}

				.obsidian-rag-success-icon {
					font-size: 16px;
					line-height: 1;
					color: var(--color-green, #28a745);
					flex-shrink: 0;
				}

				.obsidian-rag-success-text {
					display: flex;
					flex-direction: column;
					gap: 2px;
					flex: 1;
					min-width: 0;
				}

				.obsidian-rag-success-title {
					font-size: var(--font-ui-medium);
					font-weight: 600;
					color: var(--text-normal);
					line-height: 1.3;
				}

				.obsidian-rag-success-summary {
					font-size: var(--font-ui-small);
					color: var(--text-muted);
					line-height: 1.3;
				}

				.obsidian-rag-success-close {
					background: none;
					border: none;
					color: var(--text-muted);
					font-size: 16px;
					font-weight: bold;
					cursor: pointer;
					padding: 4px;
					border-radius: var(--radius-s);
					transition: all 0.2s ease;
					flex-shrink: 0;
					width: 24px;
					height: 24px;
					display: flex;
					align-items: center;
					justify-content: center;
				}

				.obsidian-rag-success-close:hover {
					background-color: var(--background-modifier-hover);
					color: var(--text-normal);
				}

				/* 确认对话框样式 */
				.obsidian-confirm-dialog-overlay {
					position: fixed;
					top: 0;
					left: 0;
					right: 0;
					bottom: 0;
					background-color: rgba(0, 0, 0, 0.5);
					display: flex;
					align-items: center;
					justify-content: center;
					z-index: 1000;
				}

				.obsidian-confirm-dialog {
					background-color: var(--background-primary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-l);
					box-shadow: var(--shadow-l);
					max-width: 400px;
					width: 90%;
					max-height: 80vh;
					overflow: hidden;
				}

				.obsidian-confirm-dialog-header {
					padding: 16px 20px;
					border-bottom: 1px solid var(--background-modifier-border);
					background-color: var(--background-secondary);
				}

				.obsidian-confirm-dialog-header h3 {
					margin: 0;
					color: var(--text-normal);
					font-size: var(--font-ui-large);
					font-weight: 600;
				}

				.obsidian-confirm-dialog-body {
					padding: 20px;
					color: var(--text-normal);
					font-size: var(--font-ui-medium);
					line-height: 1.5;
				}

				.obsidian-confirm-dialog-body p {
					margin: 0 0 12px 0;
				}

				.obsidian-confirm-dialog-warning {
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					padding: 12px;
					margin: 12px 0;
					color: var(--text-error);
					font-size: var(--font-ui-small);
					font-weight: 500;
				}

				.obsidian-confirm-dialog-scope {
					background-color: var(--background-secondary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					padding: 8px 12px;
					margin: 12px 0 0 0;
					font-size: var(--font-ui-small);
					color: var(--text-muted);
				}

				.obsidian-confirm-dialog-info {
					background-color: var(--background-secondary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					padding: 12px;
					margin: 12px 0;
				}

				.obsidian-confirm-dialog-info-item {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 8px;
					font-size: var(--font-ui-small);
				}

				.obsidian-confirm-dialog-info-item:last-child {
					margin-bottom: 0;
				}

				.obsidian-confirm-dialog-info-item strong {
					color: var(--text-normal);
					margin-right: 12px;
					flex-shrink: 0;
				}

				.obsidian-confirm-dialog-model,
				.obsidian-confirm-dialog-workspace {
					color: var(--text-accent);
					font-weight: 600;
					font-family: var(--font-monospace);
					text-align: right;
					flex: 1;
					word-break: break-all;
				}

				.obsidian-confirm-dialog-footer {
					padding: 16px 20px;
					border-top: 1px solid var(--background-modifier-border);
					background-color: var(--background-secondary);
					display: flex;
					justify-content: flex-end;
					gap: 12px;
				}

				.obsidian-confirm-dialog-cancel-btn {
					padding: 8px 16px;
					background-color: var(--interactive-normal);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					color: var(--text-normal);
					font-size: var(--font-ui-small);
					cursor: pointer;
					transition: all 0.2s ease;
					font-weight: 500;
				}

				.obsidian-confirm-dialog-cancel-btn:hover {
					background-color: var(--interactive-hover);
				}

				.obsidian-confirm-dialog-confirm-btn {
					padding: 8px 16px;
					background-color: #dc3545;
					border: 1px solid #dc3545;
					border-radius: var(--radius-s);
					color: white;
					font-size: var(--font-ui-small);
					cursor: pointer;
					transition: all 0.2s ease;
					font-weight: 500;
				}

				.obsidian-confirm-dialog-confirm-btn:hover {
					background-color: #c82333;
					border-color: #c82333;
				}
				`}
			</style>
		</div>
	)
}

export default SearchView

