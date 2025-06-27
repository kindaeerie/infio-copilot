import { ToolArgs } from "./types"

export function getAnalyzePaperDescription(args: ToolArgs): string {
	return `## analyze_paper
Description: Performs an in-depth analysis of a single academic paper or research document. This tool is designed to dissect complex documents, extracting and structuring key information such as the research methodology, core findings, contributions, and potential limitations. Use this for a deep, scholarly breakdown of a specific text. **FILE-ONLY TOOL**: This tool only accepts individual files, not folders.
Parameters:
- path: (required) The path to the file to be analyzed (relative to the current working directory: ${args.cwd}). Must be a single file (supports .md, .pdf, .txt, .docx).
Usage:
<analyze_paper>
<path>path/to/your/paper.pdf</path>
</analyze_paper>

Example: Analyze a research paper
<analyze_paper>
<path>research/machine-learning-survey.pdf</path>
</analyze_paper>`
}

export function getKeyInsightsDescription(args: ToolArgs): string {
	return `## key_insights
Description: Extracts high-level, critical insights from a document or a collection of documents in a folder. This tool goes beyond simple summarization to identify non-obvious connections, underlying themes, and actionable takeaways. Use it when you want to understand the deeper meaning or strategic implications of your notes, not just what they say. Generates a concise list of insights. **FOLDER-FRIENDLY TOOL**: Optimized for analyzing multiple related files in Obsidian vaults.
Parameters:
- path: (required) The path to the file or folder (relative to the current working directory: ${args.cwd}). When processing folders, automatically filters for .md files and excludes system folders (.obsidian, .trash). Limits processing to 50 files maximum for performance.
Usage:
<key_insights>
<path>path/to/your/file_or_folder</path>
</key_insights>

Example: Extract key insights from project documents
<key_insights>
<path>project-docs/</path>
</key_insights>

Note: For Obsidian users - This tool will automatically skip .obsidian system folders and process only markdown files unless explicitly configured otherwise.`
}

export function getDenseSummaryDescription(args: ToolArgs): string {
	return `## dense_summary
Description: Creates a highly compressed, information-rich summary of a large document or folder. The goal is maximum information density, preserving core concepts, data, and arguments. This is different from a "simple_summary"; use it when you need a thorough overview of the material without fluff, intended for an audience that needs to grasp the details quickly. **HYBRID TOOL**: Supports both individual files and folders with Obsidian-optimized processing.
Parameters:
- path: (required) The path to the file or folder (relative to the current working directory: ${args.cwd}). For folders, automatically processes .md files and limits to 50 files for performance. Excludes Obsidian system folders.
Usage:
<dense_summary>
<path>path/to/your/file_or_folder</path>
</dense_summary>

Example: Create a structured summary of a folder
<dense_summary>
<path>meeting-notes/2024/</path>
</dense_summary>

Note: For Obsidian users - When processing folders, this tool respects your vault structure and automatically filters for markdown content while excluding system folders (.obsidian, .trash).`
}
export function getReflectionsDescription(args: ToolArgs): string {
	return `## reflections
Description: Generates deep, reflective thoughts based on the content of a document or folder. This tool helps you think *with* your notes by analyzing the text's meaning and implications, asking provocative questions, and offering critical perspectives. Use this to spark new ideas, challenge your assumptions, or explore a topic from a different angle. **HYBRID TOOL**: Works with both individual files and folders, optimized for Obsidian knowledge work.
Parameters:
- path: (required) The path to the file or folder (relative to the current working directory: ${args.cwd}). For folders, processes .md files intelligently while respecting Obsidian vault organization and excluding system folders.
Usage:
<reflections>
<path>path/to/your/file_or_folder</path>
</reflections>

Example: Generate deep reflections on study notes
<reflections>
<path>study-notes/philosophy/</path>
</reflections>

Note: For Obsidian users - This tool understands your linked note structure and can generate reflections that connect ideas across multiple files in your vault. System folders (.obsidian, .trash) are automatically excluded.`
}

export function getTableOfContentsDescription(args: ToolArgs): string {
	return `## table_of_contents
Description: Generates a navigable table of contents for a long document or an entire folder of notes. It automatically detects headings and logical sections to create a clear, hierarchical outline. Use this to bring structure to your writing, organize a collection of related files, or get a high-level overview of your content. **FOLDER-FRIENDLY TOOL**: Especially useful for organizing Obsidian vault structures and creating navigation between related notes.
Parameters:
- path: (required) The path to the file or folder (relative to the current working directory: ${args.cwd}). When processing folders, automatically processes .md files and respects Obsidian folder hierarchies.
- depth: (optional) The maximum heading level to include in the ToC (1-6). Defaults to 3.
- format: (optional) The output format: "markdown", "numbered", or "nested". Defaults to "markdown".
- include_summary: (optional) Whether to include a brief one-sentence summary for each section. Defaults to false.
Usage:
<table_of_contents>
<path>path/to/your/file_or_folder</path>
</table_of_contents>

Example: Generate a detailed table of contents for project documentation
<table_of_contents>
<path>documentation/</path>
</table_of_contents>

Note: For Obsidian users - This tool automatically creates wiki-style links between files and respects your vault's linking conventions. System folders (.obsidian, .trash) are automatically excluded.`
}

export function getSimpleSummaryDescription(args: ToolArgs): string {
	return `## simple_summary
Description: Creates a clear and simple summary of a document or folder, tailored for a specific audience. This tool prioritizes readability and ease of understanding over information density. Use this when you need to explain complex topics to someone without the background knowledge, like creating an executive summary from a technical report. **HYBRID TOOL**: Supports both individual files and folders with intelligent Obsidian processing.
Parameters:
- path: (required) The path to the file or folder (relative to the current working directory: ${args.cwd}). For folders, automatically processes .md files and excludes Obsidian system folders (.obsidian, .trash). Performance-optimized with 50 file limit.
Usage:
<simple_summary>
<path>path/to/your/file_or_folder</path>
</simple_summary>

Example: Create a simple summary of technical documentation for an executive
<simple_summary>
<path>technical-specs/api-documentation.md</path>
</simple_summary>

Note: For Obsidian users - When processing folders, this tool creates accessible summaries that respect your vault's knowledge organization and automatically filters for relevant content.`
}
