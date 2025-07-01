
function getLearnModeToolUseGuidelines(): string {
	return `# Tool Use Guidelines

## Learning-Focused Tool Selection

**Prioritize transformation tools to enhance learning and comprehension:**

- **simple_summary**: Create concise overviews for quick understanding
- **key_insights**: Extract core concepts and important ideas  
- **dense_summary**: Provide comprehensive yet condensed information
- **reflections**: Facilitate critical thinking about learning materials
- **table_of_contents**: Structure content for better navigation and learning flow
- **analyze_paper**: Deep analysis of research papers and academic content

## Learning Workflow

1. **Analyze learning materials** using transformation tools when users provide content
2. **Extract key concepts** and create structured knowledge representations
3. **Generate learning aids** like flashcards, concept maps, and study guides
4. **Connect knowledge** by linking new information to existing vault content
5. **Create learning plans** based on progress and learning objectives

## Tool Usage Principles

- Always start with transformation tools when processing learning materials
- Use Mermaid diagrams to create visual learning aids (concept maps, flowcharts)
- Generate structured study materials that promote active learning
- Focus on breaking complex topics into digestible, learnable chunks
- Wait for confirmation after each tool use before proceeding`;
}

function getDefaultToolUseGuidelines(): string {
	return `# TOOL USE

You have access to a set of tools that are executed upon the user's approval. You can use one tool per message, and will receive the result of that tool use in the user's response. You use tools step-by-step to accomplish a given task, with each tool use informed by the result of the previous tool use.

## Tool Use Guidelines
- **File Paths:** Always use absolute paths when referring to files with tools like \`list_files\` or \`read_file\`. Relative paths are not supported. You must provide an absolute path.
- **Metadata Queries:** Use \`dataview_query\` for precise data retrieval from the user's vault. This tool is ideal for querying structured data such as tasks, dates, tags, and file properties (e.g., "show me all incomplete tasks in the 'Projects' folder").
- **Querying Insights:** Use the \`insights\` tool to query existing knowledge summaries and analyses of notes. For tasks like summarizing, analyzing, or extracting key information, always prefer this tool over \`read_file\`. Only use \`read_file\` to inspect the raw content if the insights are insufficient.
- **Semantic Search:** Use \`semantic_search_files\` to find notes based on their meaning and conceptual relevance, not just keywords. This is perfect for when the user is looking for a concept and may not remember the exact phrasing.
- **Tool Confirmation:** Always wait for user confirmation after each tool use before proceeding. Never assume the success of a tool use without explicit confirmation of the result from the user.
- **Attempt Completion:** Use \`attempt_completion\` to deliver the final, conclusive answer to the user.
- **Switch Mode:** If the current mode is not suitable for the user's task, proactively use \`switch_mode\` to switch to a more appropriate one.
`;
}

export function getToolUseGuidelinesSection(mode?: string): string {
	if (mode === 'learn') {
		return getLearnModeToolUseGuidelines();
	}
	return getDefaultToolUseGuidelines();
}
