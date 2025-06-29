import { ToolArgs } from "./types"

export function getCallInsightsDescription(args: ToolArgs): string {
	return `## insights
Description: Use for **Information Processing**. After reading a note's content, use this tool to process and distill the information in various ways. You must choose the most appropriate transformation type based on your goal.
Parameters:
- path: (required) The path to the file or folder to be processed (relative to the current working directory: ${args.cwd}).
- transformation: (required) The type of transformation to apply. Must be one of the following:
    - **simple_summary**: Creates a clear, simple summary. Use when you need to quickly understand the main points or explain a complex topic easily.
    - **key_insights**: Extracts high-level, critical insights and non-obvious connections. Use when you want to understand the deeper meaning or strategic implications.
    - **dense_summary**: Provides a comprehensive, information-rich summary. Use when detail is important but you need it in a condensed format.
    - **reflections**: Generates deep, reflective questions and perspectives to s·park new ideas. Use when you want to think critically *with* your notes.
    - **table_of_contents**: Creates a navigable table of contents for a long document or folder. Use for structuring and organizing content.
    - **analyze_paper**: Performs an in-depth analysis of an academic paper, breaking down its components. Use for scholarly or research documents.
Usage:
<insights>
<path>path/to/your/file.md</path>
<type>simple_summary</type>
</insights>

Example: Getting the key insights from a project note
<insights>
<path>Projects/Project_Alpha_Retrospective.md</path>
<type>key_insights</type>
</insights>`
} 
