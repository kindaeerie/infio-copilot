import { ToolArgs } from "./types"

export function getSearchAndReplaceDescription(args: ToolArgs): string {
	return `## search_and_replace
Description: Request to perform search and replace operations on a file. Each operation can specify a search pattern (string or regex) and replacement text, with optional line range restrictions and regex flags. Shows a diff preview before applying changes. Useful for revising terminology, correcting errors, or updating references throughout a document.
Parameters:
- path: (required) The path of the file to modify (relative to the current working directory ${args.cwd.toPosix()})
- operations: (required) A JSON array of search/replace operations. Each operation is an object with:
    * search: (required) The text or pattern to search for
    * replace: (required) The text to replace matches with. If multiple lines need to be replaced, use "\n" for newlines
    * start_line: (optional) Starting line number for restricted replacement
    * end_line: (optional) Ending line number for restricted replacement
    * use_regex: (optional) Whether to treat search as a regex pattern
    * ignore_case: (optional) Whether to ignore case when matching
    * regex_flags: (optional) Additional regex flags when use_regex is true
Usage:
<search_and_replace>
<path>File path here</path>
<operations>[
  {
    "search": "text to find",
    "replace": "replacement text",
    "start_line": 1,
    "end_line": 10
  }
]</operations>
</search_and_replace>

Example 1: Replace "climate change" with "climate crisis" in lines 1-10 of an essay
<search_and_replace>
<path>essays/environmental-impact.md</path>
<operations>[
  {
    "search": "climate change",
    "replace": "climate crisis",
    "start_line": 1,
    "end_line": 10
  }
]</operations>
</search_and_replace>

Example 2: Update citation format throughout a document using regex
<search_and_replace>
<path>research-paper.md</path>
<operations>[
  {
    "search": "\\(([A-Za-z]+), (\\d{4})\\)",
    "replace": "($1 et al., $2)",
    "use_regex": true,
    "ignore_case": false
  }
]</operations>
</search_and_replace>`
}
