const MatchSearchFilesInstructions = `**Match Search**: Perform fuzzy-based searches across files using keywords/phrases 
(\`match_search_files\`) to find similar texts and contents quickly.`

const RegexSearchFilesInstructions = `**Regex Search**: Perform pattern-based searches across files using regular expressions 
(\`regex_search_files\`) to find exact text matches, specific patterns, and structural elements.`

const SemanticSearchFilesInstructions = `**Semantic Search**: Efficiently locate specific information using semantic 
searches(\`semantic_search_files\`) to find content based on concepts and meaning.`

function getAskModeCapabilitiesSection(
	cwd: string,
	searchFilesTool: string,
): string {
	let searchFilesInstructions: string;
	switch (searchFilesTool) {
		case 'match':
			searchFilesInstructions = MatchSearchFilesInstructions;
			break;
		case 'regex':
			searchFilesInstructions = RegexSearchFilesInstructions;
			break;
		case 'semantic':
			searchFilesInstructions = SemanticSearchFilesInstructions;
			break;
		default:
			searchFilesInstructions = "";
	}
	return `# Capabilities

-  **Insight & Understanding**: Your most powerful capability. Use the \`insights\` tool to synthesize, analyze, and understand content across various scopes - single notes, entire folders, or tagged notes.
-  ${searchFilesInstructions}
-  **Metadata Queries**: Query structured information using \`dataview_query\` for metadata like tags, dates, and other structured data.
-  **Create & Generate**: Act as a writing partner using available tools to help expand the knowledge base with new content and structured documents.
-  **Action & Integration**: Connect vault knowledge to the outside world through external tool integrations, turning insights into actions.
`
}

function getObsidianCapabilitiesSection(
	cwd: string,
	searchFilesTool: string,
): string {
	let searchFilesInstructions: string;
	switch (searchFilesTool) {
		case 'match':
			searchFilesInstructions = MatchSearchFilesInstructions;
			break;
		case 'regex':
			searchFilesInstructions = RegexSearchFilesInstructions;
			break;
		case 'semantic':
			searchFilesInstructions = SemanticSearchFilesInstructions;
			break;
		default:
			searchFilesInstructions = "";
	}

	return `====

CAPABILITIES

- You have access to tools that let you list files, search content, read and write files, and ask follow-up questions. These tools help you effectively accomplish a wide range of tasks, such as creating notes, making edits or improvements to existing notes, understanding the current state of an Obsidian vault, and much more.
- When the user initially gives you a task, environment_details will include a list of all files in the current Obsidian folder ('${cwd}'). This file list provides an overview of the vault structure, offering key insights into how knowledge is organized through directory and file names, as well as what file formats are being used. This information can guide your decision-making on which notes might be most relevant to explore further. If you need to explore directories outside the current folder, you can use the list_files tool. If you pass 'true' for the recursive parameter, it will list files recursively. Otherwise, it will list only files at the top level, which is better suited for generic directories where you don't necessarily need the nested structure.${searchFilesInstructions}
`
}

function getLearnModeCapabilitiesSection(
	cwd: string,
	searchFilesTool: string,
): string {
	let searchFilesInstructions: string;
	switch (searchFilesTool) {
		case 'match':
			searchFilesInstructions = MatchSearchFilesInstructions;
			break;
		case 'regex':
			searchFilesInstructions = RegexSearchFilesInstructions;
			break;
		case 'semantic':
			searchFilesInstructions = SemanticSearchFilesInstructions;
			break;
		default:
			searchFilesInstructions = "";
	}

	return `====

CAPABILITIES

- You are a specialized learning assistant with access to powerful transformation tools designed to enhance learning and comprehension within Obsidian vaults.
- Your primary strength lies in processing learning materials using transformation tools like \`simple_summary\`, \`key_insights\`, \`dense_summary\`, \`reflections\`, \`table_of_contents\`, and \`analyze_paper\` to break down complex information into digestible formats.
- You excel at creating visual learning aids using Mermaid diagrams (concept maps, flowcharts, mind maps) that help users understand relationships between concepts and visualize learning pathways.
- You can generate structured study materials including flashcards, study guides, learning objectives, and practice questions tailored to the user's learning goals and current knowledge level.
- You have access to file management tools to organize learning materials, create structured note hierarchies, and maintain a well-organized knowledge base within the vault ('${cwd}').${searchFilesInstructions}
- You can identify knowledge gaps by analyzing existing notes and suggest learning paths to fill those gaps, connecting new information to the user's existing knowledge base.
- You specialize in active learning techniques that promote retention and understanding rather than passive information consumption, helping users engage deeply with their learning materials.`
}

function getDeepResearchCapabilitiesSection(): string {
	return `====

CAPABILITIES

- You have access to tools that let you search the web using internet search engines like Google to find relevant information on current events, facts, data, and other online content.
- Using search_web, you can simulate a human research process: first searching with relevant keywords to obtain initial results (containing URL, title, and content).
- Use fetch_urls_content to retrieve complete webpage content from URL to gain detailed information beyond the limited snippets provided by search_web.
- Synthesize all collected information to complete the user's task comprehensively, accurately, and in a well-structured manner, citing information sources when appropriate.`
}

export function getCapabilitiesSection(
	mode: string,
	cwd: string,
	searchFileTool: string,
): string {
	if (mode === 'ask') {
		return getAskModeCapabilitiesSection(cwd, searchFileTool);
	}
	if (mode === 'research') {
		return getDeepResearchCapabilitiesSection();
	}
	if (mode === 'learn') {
		return getLearnModeCapabilitiesSection(cwd, searchFileTool);
	}
	return getObsidianCapabilitiesSection(cwd, searchFileTool);
}
