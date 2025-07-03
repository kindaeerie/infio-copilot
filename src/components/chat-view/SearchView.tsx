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
import { Mentionable } from '../../types/mentionable'
import { getFilesWithTag } from '../../utils/glob-utils'
import { openMarkdownFile } from '../../utils/obsidian'

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
		id: string
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
		id: string
		insight: string
		insight_type: string
		similarity: number
		source_path: string
	}>>([])
	const [isSearching, setIsSearching] = useState(false)
	const [hasSearched, setHasSearched] = useState(false)
	const [searchMode, setSearchMode] = useState<'notes' | 'insights'>('notes') // 搜索模式：笔记或洞察
	// 展开状态管理 - 默认全部展开
	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
	// 新增：mentionables 状态管理
	const [mentionables, setMentionables] = useState<Mentionable[]>([])
	const [searchEditorState, setSearchEditorState] = useState<SerializedEditorState | null>(null)
	// 当前搜索范围信息
	const [currentSearchScope, setCurrentSearchScope] = useState<string>('')

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
			setCurrentSearchScope('')
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
			
			// 设置搜索范围信息
			let scopeDescription = ''
			if (currentWorkspace) {
				scopeDescription = `工作区: ${currentWorkspace.name}`
			} else {
				scopeDescription = '整个 Vault'
			}
			setCurrentSearchScope(scopeDescription)

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
			} else {
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
					img: () => <span className="obsidian-image-placeholder">[图片]</span>,
					// 代码块样式
					code: ({ children, inline }: { children: React.ReactNode; inline?: boolean; [key: string]: unknown }) => {
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

	const totalBlocks = searchResults.length
	const totalFiles = groupedResults.length

	return (
		<div className="obsidian-search-container">
			{/* 搜索输入框 */}
			<div className="obsidian-search-header">
				<SearchInputWithActions
					ref={searchInputRef}
					initialSerializedEditorState={searchEditorState}
					onChange={setSearchEditorState}
					onSubmit={handleSearch}
					mentionables={mentionables}
					setMentionables={setMentionables}
					placeholder="语义搜索（按回车键搜索）..."
					autoFocus={true}
					disabled={isSearching}
				/>
				
				{/* 搜索模式切换 */}
				<div className="obsidian-search-mode-toggle">
					<button
						className={`obsidian-search-mode-btn ${searchMode === 'notes' ? 'active' : ''}`}
						onClick={() => setSearchMode('notes')}
						title="搜索原始笔记内容"
					>
						📝 原始笔记
					</button>
					<button
						className={`obsidian-search-mode-btn ${searchMode === 'insights' ? 'active' : ''}`}
						onClick={() => setSearchMode('insights')}
						title="搜索 AI 洞察内容"
					>
						🧠 AI 洞察
					</button>
				</div>
			</div>

			{/* 结果统计 */}
			{hasSearched && !isSearching && (
				<div className="obsidian-search-stats">
					<div className="obsidian-search-stats-line">
						{searchMode === 'notes' ? (
							`${totalFiles} 个文件，${totalBlocks} 个块`
						) : (
							`${insightGroupedResults.length} 个文件，${insightResults.length} 个洞察`
						)}
					</div>
					{currentSearchScope && (
						<div className="obsidian-search-scope">
							搜索范围: {currentSearchScope}
						</div>
					)}
				</div>
			)}

			{/* 搜索进度 */}
			{isSearching && (
				<div className="obsidian-search-loading">
					正在搜索...
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
				) : (
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
				)}
				
				{!isSearching && hasSearched && (
					(searchMode === 'notes' && groupedResults.length === 0) || 
					(searchMode === 'insights' && insightGroupedResults.length === 0)
				) && (
					<div className="obsidian-no-results">
						<p>未找到相关结果</p>
					</div>
				)}
			</div>

			{/* 样式 */}
			<style>
				{`
				.obsidian-search-container {
					display: flex;
					flex-direction: column;
					height: 100%;
					font-family: var(--font-interface);
				}

				.obsidian-search-header {
					padding: 12px;
				}

				.obsidian-search-mode-toggle {
					display: flex;
					gap: 8px;
					margin-top: 8px;
					padding: 4px;
					background-color: var(--background-modifier-border);
					border-radius: var(--radius-m);
				}

				.obsidian-search-mode-btn {
					flex: 1;
					padding: 6px 12px;
					background-color: transparent;
					border: none;
					border-radius: var(--radius-s);
					color: var(--text-muted);
					font-size: var(--font-ui-small);
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.obsidian-search-mode-btn:hover {
					background-color: var(--background-modifier-hover);
					color: var(--text-normal);
				}

				.obsidian-search-mode-btn.active {
					background-color: var(--interactive-accent);
					color: var(--text-on-accent);
					font-weight: 500;
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
				`}
			</style>
		</div>
	)
}

export default SearchView 

