import { minimatch } from 'minimatch'
import { App, TFile, TFolder, Vault } from 'obsidian'

import { Workspace } from '../database/json/workspace/types'

export const findFilesMatchingPatterns = async (
	patterns: string[],
	vault: Vault,
) => {
	const files = vault.getMarkdownFiles()
	return files.filter((file) => {
		return patterns.some((pattern) => minimatch(file.path, pattern))
	})
}

/**
 * 根据标签查找文件
 */

export const getFilesWithTag = (targetTag: string, app: App): string[] => {
	// 确保输入的标签以 '#' 开头
	if (!targetTag.startsWith('#')) {
		targetTag = '#' + targetTag;
	}

	const filesWithTag: string[] = []; // 文件路径列表

	// 1. 获取 Vault 中所有的 Markdown 文件
	const allFiles = app.vault.getMarkdownFiles();

	// 2. 遍历所有文件
	for (const file of allFiles) {
		// 3. 获取当前文件的元数据缓存
		// 这个操作非常快，因为它读取的是内存中的缓存
		const cache = app.metadataCache.getFileCache(file);

		// 检查缓存是否存在，以及缓存中是否有 tags 属性
		if (cache?.tags) {
			// 4. 在文件的标签数组中查找目标标签
			// cache.tags 是一个 TagCache[] 数组，每个对象的格式为 { tag: string; position: Pos; }
			const found = cache.tags.find(tagObj => tagObj.tag === targetTag);
			if (found) {
				filesWithTag.push(file.path);
			}
		}
	}

	return filesWithTag;
}

/**
 * 列出工作区的文件和文件夹
 */
export const listFilesAndFolders = async (
	vault: Vault,
	path?: string,
	recursive = false,
	workspace?: Workspace,
	app?: App
): Promise<string[]> => {
	const result: string[] = []

	// 如果有工作区，使用工作区内容
	if (workspace && app) {
		result.push(`[Workspace: ${workspace.name}]`)
		result.push('')

		// 按类型分组处理工作区内容
		const folders = workspace.content.filter(c => c.type === 'folder')
		const tags = workspace.content.filter(c => c.type === 'tag')

		// 处理文件夹
		if (folders.length > 0) {
			result.push('=== FOLDERS ===')
			for (const folderItem of folders) {
				const folder = vault.getAbstractFileByPath(folderItem.content)
				if (folder && folder instanceof TFolder) {
					result.push(`├── ${folder.path}/`)

					if (recursive) {
						// 递归显示文件夹内容
						const subContent = await listFolderContentsRecursively(folder, '│   ')
						result.push(...subContent)
					} else {
						// 只显示第一层内容
						const subContent = await listFolderContentsFirstLevel(folder, '│   ')
						result.push(...subContent)
					}
				}
			}

			// 如果还有标签，添加空行分隔
			if (tags.length > 0) {
				result.push('')
			}
		}

		// 处理标签（使用平铺格式，不使用树状结构）
		if (tags.length > 0) {
			result.push('=== TAGS ===')
			for (const tagItem of tags) {
				const files = getFilesWithTag(tagItem.content, app)
				if (files.length > 0) {
					result.push(`${tagItem.content} (${files.length} files):`)

					// 使用简单的列表格式显示文件
					files.forEach((file) => {
						result.push(`${file}`)
					})

					// 在标签组之间添加空行
					result.push('')
				} else {
					result.push(`${tagItem.content} (0 files)`)
					result.push('')
				}
			}
		}

		return result
	}

	// 原有的单个路径逻辑（保持向后兼容）
	const startPath = path && path !== '' && path !== '.' && path !== '/' ? path : ''
	const folder = startPath ? vault.getAbstractFileByPath(startPath) : vault.getRoot()

	if (!folder || !(folder instanceof TFolder)) {
		return []
	}

	const listFolderContents = (currentFolder: TFolder, prefix = '') => {
		const children = [...currentFolder.children].sort((a, b) => {
			if (a instanceof TFolder && b instanceof TFile) return -1
			if (a instanceof TFile && b instanceof TFolder) return 1
			return a.name.localeCompare(b.name)
		})

		children.forEach((child, index) => {
			const isLast = index === children.length - 1
			const currentPrefix = prefix + (isLast ? '└── ' : '├── ')
			const nextPrefix = prefix + (isLast ? '    ' : '│   ')

			if (child instanceof TFolder) {
				result.push(`${currentPrefix}${child.path}/`)

				if (recursive) {
					listFolderContents(child, nextPrefix)
				}
			} else if (child instanceof TFile) {
				result.push(`${currentPrefix}${child.path}`)
			}
		})
	}

	if (startPath) {
		result.push(`${folder.path}/`)
		listFolderContents(folder, '')
	} else {
		result.push(`${vault.getName()}/`)
		listFolderContents(folder, '')
	}

	return result
}

/**
 * 递归列出文件夹内容
 */
const listFolderContentsRecursively = async (folder: TFolder, prefix: string): Promise<string[]> => {
	const result: string[] = []

	const children = [...folder.children].sort((a, b) => {
		if (a instanceof TFolder && b instanceof TFile) return -1
		if (a instanceof TFile && b instanceof TFolder) return 1
		return a.name.localeCompare(b.name)
	})

	for (let i = 0; i < children.length; i++) {
		const child = children[i]
		const isLast = i === children.length - 1
		const currentPrefix = prefix + (isLast ? '└── ' : '├── ')
		const nextPrefix = prefix + (isLast ? '    ' : '│   ')

		if (child instanceof TFolder) {
			result.push(`${currentPrefix}${child.path}/`)
			const subContent = await listFolderContentsRecursively(child, nextPrefix)
			result.push(...subContent)
		} else if (child instanceof TFile) {
			result.push(`${currentPrefix}${child.path}`)
		}
	}

	return result
}

/**
 * 只列出文件夹第一层内容
 */
const listFolderContentsFirstLevel = async (folder: TFolder, prefix: string): Promise<string[]> => {
	const result: string[] = []

	const children = [...folder.children].sort((a, b) => {
		if (a instanceof TFolder && b instanceof TFile) return -1
		if (a instanceof TFile && b instanceof TFolder) return 1
		return a.name.localeCompare(b.name)
	})

	children.forEach((child, index) => {
		const isLast = index === children.length - 1
		const currentPrefix = prefix + (isLast ? '└── ' : '├── ')

		if (child instanceof TFolder) {
			result.push(`${currentPrefix}${child.path}/`)
		} else if (child instanceof TFile) {
			result.push(`${currentPrefix}${child.path}`)
		}
	})

	return result
}

export const matchSearchFiles = async (vault: Vault, path: string, query: string, file_pattern: string) => {

}

export const regexSearchFiles = async (vault: Vault, path: string, regex: string, file_pattern: string) => {

}
