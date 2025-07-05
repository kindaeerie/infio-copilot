import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useApp } from '../../contexts/AppContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useTrans } from '../../contexts/TransContext'
import { TransformationType } from '../../core/transformations/trans-engine'
import { Workspace } from '../../database/json/workspace/types'
import { WorkspaceManager } from '../../database/json/workspace/WorkspaceManager'
import { SelectSourceInsight } from '../../database/schema'
import { t } from '../../lang/helpers'
import { getFilesWithTag } from '../../utils/glob-utils'
import { openMarkdownFile } from '../../utils/obsidian'

// 洞察源分组结果接口
interface InsightFileGroup {
	path: string
	fileName: string
	maxCreatedAt: number
	insights: (Omit<SelectSourceInsight, 'embedding'> & { displayTime: string })[]
	groupType?: 'file' | 'folder' | 'workspace'
}

const InsightView = () => {
	const { getTransEngine } = useTrans()
	const app = useApp()
	const { settings } = useSettings()

	// 工作区管理器
	const workspaceManager = useMemo(() => {
		return new WorkspaceManager(app)
	}, [app])

	const [insightResults, setInsightResults] = useState<(Omit<SelectSourceInsight, 'embedding'> & { displayTime: string })[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [hasLoaded, setHasLoaded] = useState(false)
	// 展开状态管理 - 默认全部展开
	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
	// 当前搜索范围信息
	const [currentScope, setCurrentScope] = useState<string>('')
	// 初始化洞察状态
	const [isInitializing, setIsInitializing] = useState(false)
	const [initProgress, setInitProgress] = useState<{
		stage: string
		current: number
		total: number
		currentItem: string
	} | null>(null)
	
	// 删除洞察状态
	const [isDeleting, setIsDeleting] = useState(false)
	const [deletingInsightId, setDeletingInsightId] = useState<number | null>(null)
	// 确认对话框状态
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

	const loadInsights = useCallback(async () => {
		setIsLoading(true)
		setHasLoaded(true)

		try {
			// 获取当前工作区
			let currentWorkspace: Workspace | null = null
			if (settings.workspace && settings.workspace !== 'vault') {
				currentWorkspace = await workspaceManager.findByName(String(settings.workspace))
			}

			// 设置范围信息
			let scopeDescription = ''
			if (currentWorkspace) {
				scopeDescription = `工作区: ${currentWorkspace.name}`
			} else {
				scopeDescription = '整个 Vault'
			}
			setCurrentScope(scopeDescription)

			const transEngine = await getTransEngine()
			const allInsights = await transEngine.getAllInsights()

			// 构建工作区范围集合（包含文件、文件夹、工作区路径）
			let workspacePaths: Set<string> | null = null
			if (currentWorkspace) {
				workspacePaths = new Set<string>()

				// 添加工作区路径
				workspacePaths.add(`workspace:${currentWorkspace.name}`)

				// 处理工作区中的文件夹和标签
				for (const item of currentWorkspace.content) {
					if (item.type === 'folder') {
						const folderPath = item.content
						
						// 添加文件夹路径本身
						workspacePaths.add(folderPath)
						
						// 获取文件夹下的所有文件
						const files = app.vault.getMarkdownFiles().filter(file => 
							file.path.startsWith(folderPath === '/' ? '' : folderPath + '/')
						)
						
						// 添加所有文件路径
						files.forEach(file => {
							workspacePaths.add(file.path)
							
							// 添加中间文件夹路径
							const dirPath = file.path.substring(0, file.path.lastIndexOf('/'))
							if (dirPath && dirPath !== folderPath) {
								let currentPath = folderPath === '/' ? '' : folderPath
								const pathParts = dirPath.substring(currentPath.length).split('/').filter(Boolean)
								
								for (let i = 0; i < pathParts.length; i++) {
									currentPath += (currentPath ? '/' : '') + pathParts[i]
									workspacePaths.add(currentPath)
								}
							}
						})

					} else if (item.type === 'tag') {
						// 获取标签对应的所有文件
						const tagFiles = getFilesWithTag(item.content, app)
						
						tagFiles.forEach(filePath => {
							workspacePaths.add(filePath)
							
							// 添加文件所在的文件夹路径
							const dirPath = filePath.substring(0, filePath.lastIndexOf('/'))
							if (dirPath) {
								const pathParts = dirPath.split('/').filter(Boolean)
								let currentPath = ''
								
								for (let i = 0; i < pathParts.length; i++) {
									currentPath += (currentPath ? '/' : '') + pathParts[i]
									workspacePaths.add(currentPath)
								}
							}
						})
					}
				}
			}

			// 过滤洞察
			let filteredInsights = allInsights
			if (workspacePaths) {
				filteredInsights = allInsights.filter(insight => 
					workspacePaths.has(insight.source_path)
				)
			}

			// 按创建时间排序，取最新的50条
			const sortedInsights = filteredInsights
				.sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
				.slice(0, 50)

			// 添加显示时间
			const insightsWithDisplayTime = sortedInsights.map(insight => ({
				...insight,
				displayTime: insight.created_at.toLocaleString('zh-CN')
			}))

			setInsightResults(insightsWithDisplayTime)

		} catch (error) {
			console.error('加载洞察失败:', error)
			setInsightResults([])
		} finally {
			setIsLoading(false)
		}
	}, [getTransEngine, settings, workspaceManager, app])

	// 组件加载时自动获取洞察
	useEffect(() => {
		loadInsights()
	}, [loadInsights])

	// 初始化工作区洞察
	const initializeWorkspaceInsights = useCallback(async () => {
		setIsInitializing(true)
		setInitProgress(null)

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

			const transEngine = await getTransEngine()
			
			// 设置初始进度状态
			setInitProgress({
				stage: '准备初始化工作区洞察',
				current: 0,
				total: 1,
				currentItem: currentWorkspace.name
			})

			// 使用 runTransformation 处理工作区
			const result = await transEngine.runTransformation({
				filePath: currentWorkspace.name, // 工作区名称作为标识
				contentType: 'workspace',
				transformationType: TransformationType.HIERARCHICAL_SUMMARY, // 使用分层摘要类型
				model: {
					provider: settings.applyModelProvider,
					modelId: settings.applyModelId,
				},
				saveToDatabase: true,
				workspaceMetadata: {
					name: currentWorkspace.name,
					description: currentWorkspace.metadata?.description || '',
					workspace: currentWorkspace
				}
			})

			// 更新进度为完成状态
			setInitProgress({
				stage: '正在完成初始化',
				current: 1,
				total: 1,
				currentItem: '保存结果'
			})

			if (result.success) {				
				// 刷新洞察列表
				await loadInsights()
				
				// 显示成功消息
				console.log(`工作区 "${currentWorkspace.name}" 洞察初始化成功`)
			} else {
				console.error('工作区洞察初始化失败:', result.error)
				throw new Error(result.error || '初始化失败')
			}

		} catch (error) {
			console.error('初始化工作区洞察时出错:', error)
			// 可以在这里添加错误提示
		} finally {
			setIsInitializing(false)
			setInitProgress(null)
		}
	}, [getTransEngine, settings, workspaceManager, loadInsights])

	// 确认删除工作区洞察
	const handleDeleteWorkspaceInsights = useCallback(() => {
		setShowDeleteConfirm(true)
	}, [])

	// 删除工作区洞察
	const deleteWorkspaceInsights = useCallback(async () => {
		setIsDeleting(true)

		try {
			// 获取当前工作区
			let currentWorkspace: Workspace | null = null
			if (settings.workspace && settings.workspace !== 'vault') {
				currentWorkspace = await workspaceManager.findByName(String(settings.workspace))
			}

			const transEngine = await getTransEngine()
			
			// 删除工作区的所有转换
			const result = await transEngine.deleteWorkspaceTransformations(currentWorkspace)

			if (result.success) {
				const workspaceName = currentWorkspace?.name || 'vault'
				console.log(`工作区 "${workspaceName}" 的 ${result.deletedCount} 个转换已成功删除`)
				
				// 刷新洞察列表
				await loadInsights()
				
				// 可以在这里添加用户通知，比如显示删除成功的消息
			} else {
				console.error('删除工作区洞察失败:', result.error)
				// 可以在这里添加错误提示
			}

		} catch (error) {
			console.error('删除工作区洞察时出错:', error)
			// 可以在这里添加错误提示
		} finally {
			setIsDeleting(false)
		}
	}, [getTransEngine, settings, workspaceManager, loadInsights])

	// 确认删除工作区洞察
	const confirmDeleteWorkspaceInsights = useCallback(async () => {
		setShowDeleteConfirm(false)
		await deleteWorkspaceInsights()
	}, [deleteWorkspaceInsights])

	// 取消删除确认
	const cancelDeleteConfirm = useCallback(() => {
		setShowDeleteConfirm(false)
	}, [])

	// 删除单个洞察
	const deleteSingleInsight = useCallback(async (insightId: number) => {
		setDeletingInsightId(insightId)

		try {
			const transEngine = await getTransEngine()
			
			// 删除单个洞察
			const result = await transEngine.deleteSingleInsight(insightId)

			if (result.success) {
				console.log(`洞察 ID ${insightId} 已成功删除`)
				
				// 刷新洞察列表
				await loadInsights()
			} else {
				console.error('删除洞察失败:', result.error)
				// 可以在这里添加错误提示
			}

		} catch (error) {
			console.error('删除洞察时出错:', error)
			// 可以在这里添加错误提示
		} finally {
			setDeletingInsightId(null)
		}
	}, [getTransEngine, loadInsights])

	const handleInsightClick = (insight: Omit<SelectSourceInsight, 'embedding'>) => {
		// 如果用户正在选择文本，不触发点击事件
		const selection = window.getSelection()
		if (selection && selection.toString().length > 0) {
			return
		}

		console.debug('🔍 [InsightView] 点击洞察结果:', {
			id: insight.id,
			path: insight.source_path,
			type: insight.insight_type,
			sourceType: insight.source_type,
			content: insight.insight.substring(0, 100) + '...'
		})

		// 检查路径是否存在
		if (!insight.source_path) {
			console.error('❌ [InsightView] 文件路径为空')
			return
		}

		// 根据洞察类型处理不同的点击行为
		if (insight.source_path.startsWith('workspace:')) {
			// 工作区洞察 - 显示详细信息或切换工作区
			const workspaceName = insight.source_path.replace('workspace:', '')
			console.debug('🌐 [InsightView] 点击工作区洞察:', workspaceName)
			// TODO: 可以实现切换到该工作区或显示工作区详情
			return
		} else if (insight.source_type === 'folder') {
			// 文件夹洞察 - 在文件管理器中显示文件夹
			console.debug('📁 [InsightView] 点击文件夹洞察:', insight.source_path)
			
			// 尝试在 Obsidian 文件管理器中显示文件夹
			const folder = app.vault.getAbstractFileByPath(insight.source_path)
			if (folder) {
				// 在文件管理器中显示文件夹
				const fileExplorer = app.workspace.getLeavesOfType('file-explorer')[0]
				if (fileExplorer) {
					// @ts-expect-error 使用 Obsidian 内部 API
					fileExplorer.view.revealInFolder(folder)
				}
				console.debug('✅ [InsightView] 在文件管理器中显示文件夹')
			} else {
				console.warn('❌ [InsightView] 文件夹不存在:', insight.source_path)
			}
			return
		} else {
			// 文件洞察 - 正常打开文件
			const file = app.vault.getFileByPath(insight.source_path)
			if (!file) {
				console.error('❌ [InsightView] 在vault中找不到文件:', insight.source_path)
				return
			}

			console.debug('✅ [InsightView] 文件存在，准备打开:', {
				file: file.path
			})

			try {
				openMarkdownFile(app, insight.source_path)
				console.debug('✅ [InsightView] 成功调用openMarkdownFile')
			} catch (error) {
				console.error('❌ [InsightView] 调用openMarkdownFile失败:', error)
			}
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

	// 按源路径分组并排序
	const insightGroupedResults = useMemo(() => {
		if (!insightResults.length) return []

		// 按源路径分组
		const sourceGroups = new Map<string, InsightFileGroup>()

		insightResults.forEach(result => {
			const sourcePath = result.source_path
			let displayName = sourcePath
			let groupType = 'file'

			// 根据源路径类型确定显示名称和类型
			if (sourcePath.startsWith('workspace:')) {
				const workspaceName = sourcePath.replace('workspace:', '')
				displayName = `🌐 工作区: ${workspaceName}`
				groupType = 'workspace'
			} else if (result.source_type === 'folder') {
				displayName = `📁 ${sourcePath.split('/').pop() || sourcePath}`
				groupType = 'folder'
			} else {
				displayName = sourcePath.split('/').pop() || sourcePath
				groupType = 'file'
			}

			if (!sourceGroups.has(sourcePath)) {
				sourceGroups.set(sourcePath, {
					path: sourcePath,
					fileName: displayName,
					maxCreatedAt: result.created_at.getTime(),
					insights: [],
					groupType: groupType === 'workspace' ? 'workspace' : groupType === 'folder' ? 'folder' : 'file'
				})
			}

			const group = sourceGroups.get(sourcePath)
			if (group) {
				group.insights.push(result)
				// 更新最新创建时间
				if (result.created_at.getTime() > group.maxCreatedAt) {
					group.maxCreatedAt = result.created_at.getTime()
				}
			}
		})

		// 对每个组内的洞察按创建时间排序
		sourceGroups.forEach(group => {
			group.insights.sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
		})

		// 按类型和时间排序：工作区 > 文件夹 > 文件
		return Array.from(sourceGroups.values()).sort((a, b) => {
			// 首先按类型排序
			const typeOrder = { workspace: 0, folder: 1, file: 2 }
			const typeComparison = typeOrder[a.groupType || 'file'] - typeOrder[b.groupType || 'file']
			if (typeComparison !== 0) return typeComparison
			
			// 同类型按时间排序
			return b.maxCreatedAt - a.maxCreatedAt
		})
	}, [insightResults])

	// 获取洞察类型的显示名称
	const getInsightTypeDisplayName = (insightType: string) => {
		const typeMapping: Record<string, string> = {
			'dense_summary': '📋 密集摘要',
			'simple_summary': '📄 简单摘要',
			'key_insights': '💡 关键洞察',
			'analyze_paper': '🔬 论文分析',
			'table_of_contents': '📑 目录大纲',
			'reflections': '🤔 思考反思'
		}
		return typeMapping[insightType] || insightType.toUpperCase()
	}

	return (
		<div className="obsidian-insight-container">
			{/* 头部信息 */}
			<div className="obsidian-insight-header">
				<div className="obsidian-insight-title">
					<h3>{t('insights.title') || 'AI 洞察'}</h3>
					<div className="obsidian-insight-actions">
						<button
							onClick={initializeWorkspaceInsights}
							disabled={isInitializing || isLoading || isDeleting}
							className="obsidian-insight-init-btn"
							title="初始化当前工作区的洞察，会递归处理所有文件并生成摘要"
						>
							{isInitializing ? '初始化中...' : '初始化洞察'}
						</button>
						<button
							onClick={handleDeleteWorkspaceInsights}
							disabled={isDeleting || isLoading || isInitializing}
							className="obsidian-insight-delete-btn"
							title="删除当前工作区的所有转换和洞察"
						>
							{isDeleting ? '删除中...' : '清除洞察'}
						</button>
						<button
							onClick={loadInsights}
							disabled={isLoading || isInitializing || isDeleting}
							className="obsidian-insight-refresh-btn"
						>
							{isLoading ? '加载中...' : '刷新'}
						</button>
					</div>
				</div>

				{/* 结果统计 */}
				{hasLoaded && !isLoading && (
					<div className="obsidian-insight-stats">
						<div className="obsidian-insight-stats-line">
							{insightGroupedResults.length} 个项目，{insightResults.length} 个洞察
							{insightGroupedResults.length > 0 && (
								<span className="obsidian-insight-breakdown">
									{' '}(
									{insightGroupedResults.filter(g => g.groupType === 'workspace').length > 0 && 
										`${insightGroupedResults.filter(g => g.groupType === 'workspace').length}工作区 `}
									{insightGroupedResults.filter(g => g.groupType === 'folder').length > 0 && 
										`${insightGroupedResults.filter(g => g.groupType === 'folder').length}文件夹 `}
									{insightGroupedResults.filter(g => g.groupType === 'file').length > 0 && 
										`${insightGroupedResults.filter(g => g.groupType === 'file').length}文件`}
									)
								</span>
							)}
						</div>
						{currentScope && (
							<div className="obsidian-insight-scope">
								范围: {currentScope}
							</div>
						)}
					</div>
				)}
			</div>

			{/* 加载进度 */}
			{isLoading && (
				<div className="obsidian-insight-loading">
					正在加载洞察...
				</div>
			)}

			{/* 初始化进度 */}
			{isInitializing && (
				<div className="obsidian-insight-initializing">
					<div className="obsidian-insight-init-header">
						<h4>正在初始化工作区洞察...</h4>
						<p>这可能需要几分钟时间，请耐心等待</p>
					</div>
					{initProgress && (
						<div className="obsidian-insight-progress">
							<div className="obsidian-insight-progress-info">
								<span className="obsidian-insight-progress-stage">{initProgress.stage}</span>
								<span className="obsidian-insight-progress-counter">
									{initProgress.current} / {initProgress.total}
								</span>
							</div>
							<div className="obsidian-insight-progress-bar">
								<div 
									className="obsidian-insight-progress-fill"
									style={{ 
										width: `${(initProgress.current / Math.max(initProgress.total, 1)) * 100}%` 
									}}
								></div>
							</div>
							<div className="obsidian-insight-progress-item">
								正在处理: {initProgress.currentItem}
							</div>
						</div>
					)}
				</div>
			)}

			{/* 确认删除对话框 */}
			{showDeleteConfirm && (
				<div className="obsidian-confirm-dialog-overlay">
					<div className="obsidian-confirm-dialog">
						<div className="obsidian-confirm-dialog-header">
							<h3>确认删除</h3>
						</div>
						<div className="obsidian-confirm-dialog-body">
							<p>
								您确定要删除当前工作区的所有洞察吗？
							</p>
							<p className="obsidian-confirm-dialog-warning">
								⚠️ 这个操作不可撤销，将删除所有生成的转换和洞察数据。
							</p>
							<div className="obsidian-confirm-dialog-scope">
								<strong>影响范围:</strong> {currentScope}
							</div>
						</div>
						<div className="obsidian-confirm-dialog-footer">
							<button
								onClick={cancelDeleteConfirm}
								className="obsidian-confirm-dialog-cancel-btn"
							>
								取消
							</button>
							<button
								onClick={confirmDeleteWorkspaceInsights}
								className="obsidian-confirm-dialog-confirm-btn"
							>
								确认删除
							</button>
						</div>
					</div>
				</div>
			)}

			{/* 洞察结果 */}
			<div className="obsidian-insight-results">
				{!isLoading && insightGroupedResults.length > 0 && (
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
											<div className="obsidian-file-header-right">
												<span className="obsidian-insight-count">
													{fileGroup.insights.length} 个洞察
												</span>
											</div>
										</div>
										<div className="obsidian-file-path-row">
											<span className="obsidian-file-path">{fileGroup.path}</span>
											<div className="obsidian-insight-types">
												{Array.from(new Set(fileGroup.insights.map(insight => insight.insight_type)))
													.map(type => (
														<span key={type} className="obsidian-insight-type-tag">
															{getInsightTypeDisplayName(type)}
														</span>
													))
												}
											</div>
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
												onClick={() => handleInsightClick(insight)}
											>
												<div className="obsidian-result-header">
													<div className="obsidian-result-header-left">
														<span className="obsidian-result-index">{insightIndex + 1}</span>
														<span className="obsidian-result-insight-type">
															{getInsightTypeDisplayName(insight.insight_type)}
														</span>
														<span className="obsidian-result-time">
															{insight.displayTime}
														</span>
													</div>
													<div className="obsidian-result-header-right">
														<button
															className="obsidian-delete-insight-btn"
															onClick={(e) => {
																e.stopPropagation()
																deleteSingleInsight(insight.id)
															}}
															disabled={deletingInsightId === insight.id}
															title="删除此洞察"
														>
															{deletingInsightId === insight.id ? '删除中...' : '🗑️'}
														</button>
													</div>
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
				)}

				{!isLoading && hasLoaded && insightGroupedResults.length === 0 && (
					<div className="obsidian-no-results">
						<p>当前范围内没有找到洞察数据</p>
						<p className="obsidian-no-results-hint">
							请尝试在文档上运行转换工具来生成 AI 洞察
						</p>
					</div>
				)}
			</div>

			{/* 样式 */}
			<style>
				{`
				.obsidian-insight-container {
					display: flex;
					flex-direction: column;
					height: 100%;
					font-family: var(--font-interface);
				}

				.obsidian-insight-header {
					padding: 12px;
					border-bottom: 1px solid var(--background-modifier-border);
				}

				.obsidian-insight-title {
					display: flex;
					align-items: center;
					justify-content: space-between;
					margin-bottom: 8px;
				}

				.obsidian-insight-title h3 {
					margin: 0;
					color: var(--text-normal);
					font-size: var(--font-ui-large);
					font-weight: 600;
				}

				.obsidian-insight-actions {
					display: flex;
					gap: 8px;
				}

				.obsidian-insight-init-btn {
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

				.obsidian-insight-init-btn:hover:not(:disabled) {
					background-color: var(--interactive-accent-hover);
				}

				.obsidian-insight-init-btn:disabled {
					opacity: 0.6;
					cursor: not-allowed;
				}

				.obsidian-insight-delete-btn {
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

				.obsidian-insight-delete-btn:hover:not(:disabled) {
					background-color: #c82333;
				}

				.obsidian-insight-delete-btn:disabled {
					opacity: 0.6;
					cursor: not-allowed;
				}

				.obsidian-insight-refresh-btn {
					padding: 6px 12px;
					background-color: var(--interactive-normal);
					border: none;
					border-radius: var(--radius-s);
					color: var(--text-normal);
					font-size: var(--font-ui-small);
					cursor: pointer;
					transition: background-color 0.2s ease;
				}

				.obsidian-insight-refresh-btn:hover:not(:disabled) {
					background-color: var(--interactive-hover);
				}

				.obsidian-insight-refresh-btn:disabled {
					opacity: 0.6;
					cursor: not-allowed;
				}

				.obsidian-insight-stats {
					font-size: var(--font-ui-small);
					color: var(--text-muted);
				}

				.obsidian-insight-stats-line {
					margin-bottom: 2px;
				}

				.obsidian-insight-breakdown {
					color: var(--text-faint);
					font-size: var(--font-ui-smaller);
				}

				.obsidian-insight-scope {
					font-size: var(--font-ui-smaller);
					color: var(--text-accent);
					font-weight: 500;
				}

				.obsidian-insight-loading {
					padding: 20px;
					text-align: center;
					color: var(--text-muted);
					font-size: var(--font-ui-medium);
				}

				.obsidian-insight-initializing {
					padding: 20px;
					background-color: var(--background-secondary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-m);
					margin: 12px;
				}

				.obsidian-insight-init-header {
					text-align: center;
					margin-bottom: 16px;
				}

				.obsidian-insight-init-header h4 {
					margin: 0 0 8px 0;
					color: var(--text-normal);
					font-size: var(--font-ui-medium);
					font-weight: 600;
				}

				.obsidian-insight-init-header p {
					margin: 0;
					color: var(--text-muted);
					font-size: var(--font-ui-small);
				}

				.obsidian-insight-progress {
					background-color: var(--background-primary);
					padding: 12px;
					border-radius: var(--radius-s);
					border: 1px solid var(--background-modifier-border);
				}

				.obsidian-insight-progress-info {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 8px;
				}

				.obsidian-insight-progress-stage {
					color: var(--text-normal);
					font-size: var(--font-ui-small);
					font-weight: 500;
				}

				.obsidian-insight-progress-counter {
					color: var(--text-muted);
					font-size: var(--font-ui-small);
					font-family: var(--font-monospace);
				}

				.obsidian-insight-progress-bar {
					width: 100%;
					height: 6px;
					background-color: var(--background-modifier-border);
					border-radius: 3px;
					overflow: hidden;
					margin-bottom: 8px;
				}

				.obsidian-insight-progress-fill {
					height: 100%;
					background-color: var(--interactive-accent);
					border-radius: 3px;
					transition: width 0.3s ease;
				}

				.obsidian-insight-progress-item {
					color: var(--text-muted);
					font-size: var(--font-ui-smaller);
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}

				.obsidian-insight-results {
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
					gap: 8px;
					flex-shrink: 0;
				}

				.obsidian-insight-count {
					color: var(--text-muted);
					font-size: var(--font-ui-smaller);
					background-color: var(--background-modifier-border);
					padding: 2px 6px;
					border-radius: var(--radius-s);
					font-weight: 500;
				}

				.obsidian-file-path-row {
					margin-left: 24px;
					display: flex;
					flex-direction: column;
					gap: 4px;
				}

				.obsidian-insight-types {
					display: flex;
					flex-wrap: wrap;
					gap: 4px;
					margin-top: 4px;
				}

				.obsidian-insight-type-tag {
					color: var(--text-muted);
					font-size: var(--font-ui-smaller);
					background-color: var(--background-modifier-border-hover);
					padding: 1px 4px;
					border-radius: var(--radius-s);
					font-weight: 500;
				}

				.obsidian-expand-icon {
					color: var(--text-muted);
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
					justify-content: space-between;
					margin-bottom: 6px;
					gap: 8px;
				}

				.obsidian-result-header-left {
					display: flex;
					align-items: center;
					gap: 8px;
					flex: 1;
					min-width: 0;
				}

				.obsidian-result-header-right {
					display: flex;
					align-items: center;
					flex-shrink: 0;
				}

				.obsidian-delete-insight-btn {
					padding: 2px 6px;
					background-color: transparent;
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					color: var(--text-muted);
					font-size: var(--font-ui-smaller);
					cursor: pointer;
					transition: all 0.2s ease;
					display: flex;
					align-items: center;
					justify-content: center;
					min-width: 24px;
					height: 20px;
				}

				.obsidian-delete-insight-btn:hover:not(:disabled) {
					background-color: #dc3545;
					border-color: #dc3545;
					color: white;
				}

				.obsidian-delete-insight-btn:disabled {
					opacity: 0.6;
					cursor: not-allowed;
					font-size: 10px;
				}

				.obsidian-result-index {
					color: var(--text-muted);
					font-size: var(--font-ui-small);
					font-weight: 500;
					min-width: 16px;
					flex-shrink: 0;
				}

				.obsidian-result-insight-type {
					color: var(--text-accent);
					font-size: var(--font-ui-smaller);
					font-weight: 600;
					background-color: var(--background-modifier-border);
					padding: 2px 6px;
					border-radius: var(--radius-s);
					flex-grow: 1;
				}

				.obsidian-result-time {
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

				.obsidian-insight-content {
					color: var(--text-normal);
					font-size: var(--font-ui-medium);
					line-height: 1.5;
					white-space: pre-wrap;
					user-select: text;
					cursor: text;
				}

				.obsidian-no-results {
					padding: 40px 20px;
					text-align: center;
					color: var(--text-muted);
				}

				.obsidian-no-results p {
					margin: 8px 0;
					font-size: var(--font-ui-medium);
				}

				.obsidian-no-results-hint {
					font-size: var(--font-ui-small);
					color: var(--text-faint);
					font-style: italic;
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

export default InsightView 
