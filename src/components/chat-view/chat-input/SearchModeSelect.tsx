import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, ChevronUp, FileText, Lightbulb, Globe } from 'lucide-react'
import { useState } from 'react'

import { t } from '../../../lang/helpers'

interface SearchModeSelectProps {
	searchMode: 'notes' | 'insights' | 'all'
	onSearchModeChange: (mode: 'notes' | 'insights' | 'all') => void
}

export function SearchModeSelect({ searchMode, onSearchModeChange }: SearchModeSelectProps) {
	const [isOpen, setIsOpen] = useState(false)

	const searchModes = [
		{
			value: 'all' as const,
			name: t('semanticSearch.searchMode.all'),
			icon: <Globe size={14} />,
			description: t('semanticSearch.searchMode.allDescription')
		},
		{
			value: 'notes' as const,
			name: t('semanticSearch.searchMode.notes'),
			icon: <FileText size={14} />,
			description: t('semanticSearch.searchMode.notesDescription')
		},
		{
			value: 'insights' as const,
			name: t('semanticSearch.searchMode.insights'),
			icon: <Lightbulb size={14} />,
			description: t('semanticSearch.searchMode.insightsDescription')
		}
	]

	const currentMode = searchModes.find((m) => m.value === searchMode)

	return (
		<>
			<DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen}>
				<DropdownMenu.Trigger className="infio-chat-input-search-mode-select">
					<span className="infio-search-mode-icon">{currentMode?.icon}</span>
					<div className="infio-chat-input-search-mode-select__mode-name">
						{currentMode?.name}
					</div>
					<div className="infio-chat-input-search-mode-select__icon">
						{isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
					</div>
				</DropdownMenu.Trigger>

				<DropdownMenu.Portal>
					<DropdownMenu.Content
						className="infio-popover infio-search-mode-select-content">
						<ul>
							{searchModes.map((mode) => (
								<DropdownMenu.Item
									key={mode.value}
									onSelect={() => {
										onSearchModeChange(mode.value)
									}}
									asChild
								>
									<li className="infio-search-mode-item">
										<div className="infio-search-mode-left">
											<span className="infio-search-mode-icon">{mode.icon}</span>
											<div className="infio-search-mode-info">
												<span className="infio-search-mode-name">{mode.name}</span>
												<span className="infio-search-mode-description">{mode.description}</span>
											</div>
										</div>
									</li>
								</DropdownMenu.Item>
							))}
						</ul>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
			<style>{`
				button.infio-chat-input-search-mode-select {
					background-color: transparent;
					box-shadow: none;
					border: 1px solid var(--background-modifier-border);
					padding: var(--size-2-1) var(--size-2-2);
					font-size: var(--font-smallest);
					font-weight: var(--font-medium);
					color: var(--text-muted);
					display: flex;
					justify-content: flex-start;
					align-items: center;
					cursor: pointer;
					height: auto;
					max-width: 100%;
					gap: var(--size-2-2);
					border-radius: var(--radius-l);
					transition: all 0.15s ease-in-out;

					&:hover {
						color: var(--text-normal);
						background-color: var(--background-modifier-hover);
					}

					.infio-chat-input-search-mode-select__mode-name {
						flex-shrink: 1;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
						flex-grow: 1;
					}

					.infio-chat-input-search-mode-select__icon {
						flex-shrink: 0;
						display: flex;
						align-items: center;
						justify-content: center;
					}
				}

				.infio-search-mode-select-content {
					min-width: auto !important;
					width: fit-content !important;
					max-width: 280px;
				}

				.infio-search-mode-item {
					display: flex;
					justify-content: space-between;
					align-items: center;
					width: 100%;
					padding: var(--size-4-2) var(--size-4-2);
					white-space: nowrap;
				}

				.infio-search-mode-left {
					display: flex;
					align-items: center;
					gap: var(--size-2-3);
				}

				.infio-search-mode-icon {
					display: flex;
					align-items: center;
					justify-content: center;
					color: var(--text-accent);
					flex-shrink: 0;
				}

				.infio-search-mode-info {
					display: flex;
					flex-direction: column;
					gap: var(--size-2-1);
				}

				.infio-search-mode-name {
					flex-shrink: 0;
					font-weight: var(--font-medium);
				}

				.infio-search-mode-description {
					font-size: var(--font-smallest);
					color: var(--text-muted);
					flex-shrink: 0;
				}
			`}</style>
		</>
	)
} 
