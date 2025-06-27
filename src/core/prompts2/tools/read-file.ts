import { ToolArgs } from "./types"

export function getReadFileDescription(args: ToolArgs): string {
	return `## read_file
Description: Request to read the contents of a file at the specified path. Use this when you need to examine the contents of an existing file you do not know the contents of, for example to analyze document structure, review text content, or extract information from reference materials. The output includes line numbers prefixed to each line (e.g. "1 | # Introduction"), making it easier to reference specific sections when creating edits or discussing content. Automatically extracts text from PDF and DOCX files. May not be suitable for other types of binary files, as it returns the raw content as a string.
Parameters:
- path: (required) The path of the file to read (relative to the current working directory ${args.cwd})
Usage:
<read_file>
<path>File path here</path>
</read_file>

Example: Requesting to read literature-review.md
<read_file>
<path>literature-review.md</path>
</read_file>`
}
