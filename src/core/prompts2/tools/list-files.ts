import { ToolArgs } from "./types"

export function getListFilesDescription(args: ToolArgs): string {
	return `## list_files
Description: Request to list files and directories within the specified directory in the Obsidian vault. If recursive is true, it will list all files and directories recursively. This is particularly useful for understanding the vault structure, discovering note organization patterns, finding templates, or locating notes across different areas of the knowledge base. Use this to navigate through the vault's folder structure to find relevant notes.
Parameters:
- path: (required) The path of the directory to list contents for (relative to the current working directory ${args.cwd})
- recursive: (optional) Whether to list files recursively. Use true for recursive listing, false or omit for top-level only.
Usage:
<list_files>
<path>Directory path here</path>
<recursive>true or false (optional)</recursive>
</list_files>

Example: Discovering all notes in a specific area of knowledge
<list_files>
<path>Areas/Programming</path>
<recursive>true</recursive>
</list_files>`
}
