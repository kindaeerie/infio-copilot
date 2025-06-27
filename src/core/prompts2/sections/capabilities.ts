const MatchSearchFilesInstructions = "\n- You can use match_search_files to perform fuzzy-based searches across files using keyword/phrase. This tool is ideal for finding similar texts in notes. It excels at finding similar contents with similar keywords and phrases quickly."

const RegexSearchFilesInstructions = "\n- You can use regex_search_files to perform pattern-based searches across files using regular expressions. This tool is ideal for finding exact text matches, specific patterns (like tags, links, dates, URLs), or structural elements in notes. It excels at locating precise format patterns and is perfect for finding connections between notes, frontmatter elements, or specific Markdown formatting."

const SemanticSearchFilesInstructions = "\n- You can use semantic_search_files to find content based on meaning rather than exact text matches. Semantic search uses embedding vectors to understand concepts and ideas, finding relevant content even when keywords differ. This is especially powerful for discovering thematically related notes, answering conceptual questions about your knowledge base, or finding content when you don't know the exact wording used in the notes."

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
	searchWebTool: string,
): string {
	if (mode === 'research') {
		return getDeepResearchCapabilitiesSection();
	}
	return getObsidianCapabilitiesSection(cwd, searchWebTool);
}
