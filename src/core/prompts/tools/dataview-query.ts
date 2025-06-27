import { ToolArgs } from "./types"

export function getDataviewQueryDescription(args: ToolArgs): string {
	return `## dataview_query
Description: Execute advanced queries using the Dataview plugin to retrieve and filter note information across multiple dimensions. Supports complex queries by time, tags, task status, file properties, and more. This is a powerful tool for obtaining structured note data, particularly useful for statistical analysis, content organization, and progress tracking scenarios.
Parameters:
- query: (required) The Dataview query statement to execute. Supports DQL (Dataview Query Language) syntax, including TABLE, LIST, TASK query types
- output_format: (optional) Output format, options: table, list, task, calendar (defaults to table)

Common Query Patterns:

**Time-based Queries:**
- Recently created: \`WHERE file.ctime >= date(today) - dur(7 days)\`
- Recently modified: \`WHERE file.mtime >= date(today) - dur(3 days)\`
- Specific date: \`WHERE file.cday = date("2024-01-01")\`

**Tag-based Queries:**
- Contains specific tag: \`WHERE contains(file.tags, "#project")\`
- Multiple tag combination: \`WHERE contains(file.tags, "#work") AND contains(file.tags, "#urgent")\`
- Tag statistics: \`GROUP BY file.tags\`

**Task-based Queries:**
- Incomplete tasks: \`TASK WHERE !completed\`
- Completed tasks: \`TASK WHERE completed\`
- Specific priority tasks: \`TASK WHERE contains(text, "high priority")\`

**File Property Queries:**
- File size: \`WHERE file.size > 1000\`
- File type: \`WHERE file.ext = "md"\`
- Folder: \`FROM "Projects"\`

Usage:
<dataview_query>
<query>Your Dataview query statement</query>
<output_format>table|list|task|calendar (optional)</output_format>
</dataview_query>

**Example 1: Get notes created in the last 7 days with #project tag**
<dataview_query>
<query>TABLE file.ctime as "Created", file.tags as "Tags"
FROM ""
WHERE file.ctime >= date(today) - dur(7 days) AND contains(file.tags, "#project")
SORT file.ctime DESC</query>
<output_format>table</output_format>
</dataview_query>

**Example 2: List all incomplete tasks**
<dataview_query>
<query>TASK
FROM ""
WHERE !completed
GROUP BY file.link</query>
<output_format>task</output_format>
</dataview_query>

**Example 3: Get notes modified in a week**
<dataview_query>
<query>LIST file.mtime
FROM ""
WHERE file.mtime >= date(today) - dur(7 days)
SORT file.mtime DESC</query>
<output_format>list</output_format>
</dataview_query>

**Advanced Features:**
- Use FLATTEN to expand array data
- Use GROUP BY for grouping and statistics
- Use complex WHERE conditions for filtering
- Support date calculations and comparisons
- Support regular expression matching

Note: Query statements must follow the DQL syntax specifications of the Dataview plugin. Current working directory: ${args.cwd}`
}
