import { Sparkles } from 'lucide-react'
import React from 'react'

import { useApp } from "../../../contexts/AppContext"
import { ApplyStatus, ToolArgs } from "../../../types/apply"
import { openMarkdownFile } from "../../../utils/obsidian"

export type TransformationToolType = 'analyze_paper' | 'key_insights' | 'dense_summary' | 'reflections' | 'table_of_contents' | 'simple_summary'

interface MarkdownTransformationToolBlockProps {
	applyStatus: ApplyStatus
	onApply: (args: ToolArgs) => void
	toolType: TransformationToolType
	path: string
	depth?: number
	format?: string
	include_summary?: boolean
	finish: boolean
}

const getToolConfig = (toolType: TransformationToolType) => {
	switch (toolType) {
		case 'analyze_paper':
			return {
				icon: <Sparkles size={14} className="infio-chat-code-block-header-icon" />,
				title: 'Analyze Paper',
				description: 'Deep analysis of academic papers'
			}
		case 'key_insights':
			return {
				icon: <Sparkles size={14} className="infio-chat-code-block-header-icon" />,
				title: 'Key Insights',
				description: 'Extract key insights'
			}
		case 'dense_summary':
			return {
				icon: <Sparkles size={14} className="infio-chat-code-block-header-icon" />,
				title: 'Dense Summary',
				description: 'Create information-dense summary'
			}
		case 'reflections':
			return {
				icon: <Sparkles size={14} className="infio-chat-code-block-header-icon" />,
				title: 'Deep Reflections',
				description: 'Generate deep reflections'
			}
		case 'table_of_contents':
			return {
				icon: <Sparkles size={14} className="infio-chat-code-block-header-icon" />,
				title: 'Table of Contents',
				description: 'Generate table of contents structure'
			}
		case 'simple_summary':
			return {
				icon: <Sparkles size={14} className="infio-chat-code-block-header-icon" />,
				title: 'Simple Summary',
				description: 'Create readable summary'
			}
		default:
			return {
				icon: <Sparkles size={14} className="infio-chat-code-block-header-icon" />,
				title: 'Document Processing',
				description: 'Process document'
			}
	}
}

export default function MarkdownTransformationToolBlock({
	applyStatus,
	onApply,
	toolType,
	path,
	depth,
	format,
	include_summary,
	finish
}: MarkdownTransformationToolBlockProps) {
	const app = useApp()
	const config = getToolConfig(toolType)

	const handleClick = () => {
		if (path) {
			openMarkdownFile(app, path)
		}
	}

	React.useEffect(() => {
		if (finish && applyStatus === ApplyStatus.Idle) {
			// 构建符合标准ToolArgs类型的参数
			if (toolType === 'table_of_contents') {
				onApply({
					type: toolType,
					path: path || '',
					depth,
					format,
					include_summary
				})
			} else {
				onApply({
					type: toolType,
					path: path || '',
				})
			}
		}
	}, [finish])

	const getDisplayText = () => {
		if (toolType === 'table_of_contents') {
			let text = `${config.title}: ${path || '未指定路径'}`
			if (depth) text += ` (深度: ${depth})`
			if (format) text += ` (格式: ${format})`
			if (include_summary) text += ` (包含摘要)`
			return text
		}
		return `${config.title}: ${path || '未指定路径'}`
	}

	return (
		<div
			className={`infio-chat-code-block ${path ? 'has-filename' : ''}`}
			onClick={handleClick}
			style={{ cursor: path ? 'pointer' : 'default' }}
		>
			<div className={'infio-chat-code-block-header'}>
				<div className={'infio-chat-code-block-header-filename'}>
					{config.icon}
					<span>{getDisplayText()}</span>
				</div>
			</div>
		</div>
	)
} 
