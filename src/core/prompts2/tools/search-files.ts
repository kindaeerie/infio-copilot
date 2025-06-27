import { ToolArgs } from "./types"

export function getSearchFilesDescription(args: ToolArgs): string {
	if (args.searchTool === 'match') {
		return getMatchSearchFilesDescription(args)
	} else if (args.searchTool === 'regex') {
		return getRegexSearchFilesDescription(args)
	} else if (args.searchTool === 'semantic') {
		return getSemanticSearchFilesDescription(args)
	} else {
		return ""
	}
}

export function getMatchSearchFilesDescription(args: ToolArgs): string {
	return `## match_search_files
Description: Request to perform a match/fuzzy search across files in a specified directory, providing context-rich results. This tool searches for specific content across multiple files, displaying each match with encapsulating context.
Parameters:
- path: (required) The path of the directory to search in (relative to the current working directory ${args.cwd}). This directory will be recursively searched.
- query: (required) The keyword/phrase to search for. The system will find documents with similar keywords/phrases.

Usage:
<match_search_files>
<path>Directory path here</path>
<query>Your keyword/phrase here</query>
</match_search_files>

Example: Requesting to search for all Markdown files containing 'test' in the current directory
<match_search_files>
<path>.</path>
<query>test</query>
</match_search_files>`
}

export function getRegexSearchFilesDescription(args: ToolArgs): string {
	let regex_syntax: string;
	switch (args.searchSettings.regexBackend) {
		case 'coreplugin':
			regex_syntax = "ECMAScript (JavaScript)";
			break;
		case 'ripgrep':
			regex_syntax = "Rust";
			break;
		default:
			regex_syntax = "ECMAScript (JavaScript)";
	}

	return `## regex_search_files
Description: Request to perform a regex search across files in a specified directory, providing context-rich results. This tool searches for patterns or specific content across multiple files, displaying each match with encapsulating context.
Parameters:
- path: (required) The path of the directory to search in (relative to the current working directory ${args.cwd}). This directory will be recursively searched.
- regex: (required) The regular expression pattern to search for. Uses ${regex_syntax} regex syntax, **but should not include word boundaries (\b)**.

Usage:
<regex_search_files>
<path>Directory path here</path>
<regex>Your regex pattern here</regex>
</regex_search_files>

Example: Requesting to search for all Markdown files in the current directory
<regex_search_files>
<path>.</path>
<regex>.*</regex>
</regex_search_files>`
}

export function getSemanticSearchFilesDescription(args: ToolArgs): string {
	return `## semantic_search_files
Description: Request to perform a semantic search across files in a specified directory. This tool searches for documents with content semantically related to your query, leveraging embedding vectors to find conceptually similar information. Ideal for finding relevant documents even when exact keywords are not known or for discovering thematically related content.
Parameters:
- path: (required) The path of the directory to search in (relative to the current working directory ${args.cwd}). This directory will be recursively searched.
- query: (required) The natural language query describing the information you're looking for. The system will find documents with similar semantic meaning.
Usage:
<semantic_search_files>
<path>Directory path here</path>
<query>Your natural language query here</query>
</semantic_search_files>

Example: Requesting to find documents related to a specific topic
<semantic_search_files>
<path>Project/notes</path>
<query>Benefits of meditation for stress reduction</query>
</semantic_search_files>`
}
