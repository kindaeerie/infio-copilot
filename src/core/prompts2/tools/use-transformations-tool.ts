import { ToolArgs } from "./types"

export function getAnalyzePaperDescription(args: ToolArgs): string {
	return `## analyze_paper
Description: Performs an in-depth analysis of a single academic paper or research document. This tool is designed to dissect complex documents, extracting and structuring key information such as the research methodology, core findings, contributions, and potential limitations. Use this for a deep, scholarly breakdown of a specific text.
Parameters:
- path: (required) The path to the file to be analyzed (relative to the current working directory: ${args.cwd}).
- focus: (optional) The specific area of analysis, e.g., "methodology", "findings", "limitations". This helps narrow the scope of the analysis to what you're most interested in.
Usage:
<analyze_paper>
<path>path/to/your/paper.pdf</path>
<focus>methodology</focus>
</analyze_paper>

Example: Analyze a research paper
<analyze_paper>
<path>research/machine-learning-survey.pdf</path>
<focus>methodology</focus>
</analyze_paper>`
}

export function getKeyInsightsDescription(args: ToolArgs): string {
	return `## key_insights
Description: Extracts high-level, critical insights from a document or a collection of documents in a folder. This tool goes beyond simple summarization to identify non-obvious connections, underlying themes, and actionable takeaways. Use it when you want to understand the deeper meaning or strategic implications of your notes, not just what they say. Generates a concise list of insights.
Parameters:
- path: (required) The path to the file or folder (relative to the current working directory: ${args.cwd}).
- count: (optional) The desired number of key insights to extract. Defaults to 5.
- category: (optional) The category of insights to focus on, such as "technical", "business", or "strategic". This helps tailor the output to a specific domain of interest.
Usage:
<key_insights>
<path>path/to/your/file_or_folder</path>
<count>Number of insights (optional)</count>
<category>Insight category (optional)</category>
</key_insights>

Example: Extract key insights from project documents
<key_insights>
<path>project-docs/</path>
<count>10</count>
<category>technical</category>
</key_insights>`
}

export function getDenseSummaryDescription(args: ToolArgs): string {
	return `## dense_summary
Description: Creates a highly compressed, information-rich summary of a large document or folder. The goal is maximum information density, preserving core concepts, data, and arguments. This is different from a "simple_summary"; use it when you need a thorough overview of the material without fluff, intended for an audience that needs to grasp the details quickly.
Parameters:
- path: (required) The path to the file or folder (relative to the current working directory: ${args.cwd}).
- length: (optional) The target length of the summary: "short", "medium", or "long". Defaults to "medium".
- style: (optional) The format of the summary: "bullet-points", "paragraph", or "structured". Defaults to "structured".
Usage:
<dense_summary>
<path>path/to/your/file_or_folder</path>
<length>Summary length (optional)</length>
<style>Summary style (optional)</style>
</dense_summary>

Example: Create a structured summary of a folder
<dense_summary>
<path>meeting-notes/2024/</path>
<length>medium</length>
<style>structured</style>
</dense_summary>`
}

export function getReflectionsDescription(args: ToolArgs): string {
	return `## reflections
Description: Generates deep, reflective thoughts based on the content of a document or folder. This tool helps you think *with* your notes by analyzing the text's meaning and implications, asking provocative questions, and offering critical perspectives. Use this to spark new ideas, challenge your assumptions, or explore a topic from a different angle.
Parameters:
- path: (required) The path to the file or folder (relative to the current working directory: ${args.cwd}).
- perspective: (optional) The angle from which to reflect: e.g., "learner", "critic", "strategist", "researcher". This frames the generated reflections.
- depth: (optional) The desired depth of reflection: "surface", "deep", or "philosophical". Defaults to "deep".
Usage:
<reflections>
<path>path/to/your/file_or_folder</path>
<perspective>Reflection perspective (optional)</perspective>
<depth>Reflection depth (optional)</depth>
</reflections>

Example: Generate deep reflections on study notes
<reflections>
<path>study-notes/philosophy/</path>
<perspective>learner</perspective>
<depth>philosophical</depth>
</reflections>`
}

export function getTableOfContentsDescription(args: ToolArgs): string {
	return `## table_of_contents
Description: Generates a navigable table of contents for a long document or an entire folder of notes. It automatically detects headings and logical sections to create a clear, hierarchical outline. Use this to bring structure to your writing, organize a collection of related files, or get a high-level overview of your content.
Parameters:
- path: (required) The path to the file or folder (relative to the current working directory: ${args.cwd}).
- depth: (optional) The maximum heading level to include in the ToC (1-6). Defaults to 3.
- format: (optional) The output format: "markdown", "numbered", or "nested". Defaults to "markdown".
- include_summary: (optional) Whether to include a brief one-sentence summary for each section. Defaults to false.
Usage:
<table_of_contents>
<path>path/to/your/file_or_folder</path>
<depth>Directory depth (optional)</depth>
<format>Output format (optional)</format>
<include_summary>Include section summaries (optional)</include_summary>
</table_of_contents>

Example: Generate a detailed table of contents for project documentation
<table_of_contents>
<path>documentation/</path>
<depth>4</depth>
<format>nested</format>
<include_summary>true</include_summary>
</table_of_contents>`
}

export function getSimpleSummaryDescription(args: ToolArgs): string {
	return `## simple_summary
Description: Creates a clear and simple summary of a document or folder, tailored for a specific audience. This tool prioritizes readability and ease of understanding over information density. Use this when you need to explain complex topics to someone without the background knowledge, like creating an executive summary from a technical report.
Parameters:
- path: (required) The path to the file or folder (relative to the current working directory: ${args.cwd}).
- audience: (optional) The intended audience for the summary: "general", "technical", or "executive". Defaults to "general".
- language: (optional) The complexity of the language used: "simple", "standard", or "professional". Defaults to "standard".
Usage:
<simple_summary>
<path>path/to/your/file_or_folder</path>
<audience>Target audience (optional)</audience>
<language>Language complexity (optional)</language>
</simple_summary>

Example: Create a simple summary of technical documentation for an executive
<simple_summary>
<path>technical-specs/api-documentation.md</path>
<audience>executive</audience>
<language>simple</language>
</simple_summary>`
}
