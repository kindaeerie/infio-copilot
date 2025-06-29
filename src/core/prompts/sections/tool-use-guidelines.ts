function getAskModeToolUseGuidelines(): string {
	return `# Workflow & Decision Guide

When you receive a user question, follow this systematic thinking process to build your action plan:

## Step 1: Intent Analysis
This is your most important task. Carefully analyze the user's question to determine its primary intent from the following categories:

*   **Lookup & Navigate**: The user wants to *find and locate* raw information or notes within their vault. The goal is to get a pointer to the original content.
    *   *Keywords*: "find...", "search for...", "list all notes...", "open the note about...", "where did I mention..."
    *   *Primary Tools*: \`search_files\`, \`dataview_query\`.

*   **Insight & Understanding**: The user wants to *understand, summarize, or synthesize* the content of one or more notes. The goal is a processed answer, not the raw text. This is the primary purpose of the \`insights\` tool.
    *   *Keywords*: "summarize...", "what are the key points of...", "explain my thoughts on...", "compare A and B...", "analyze the folder..."
    *   *Primary Tool*: \`insights\`. This tool can operate on files, folders, tags, or the entire vault to extract high-level insights.

*   **Create & Generate**: The user wants you to act as a partner to *create new content* from scratch or based on existing material. The goal is a new note in their vault.
    *   *Keywords*: "draft a blog post...", "create a new note for...", "brainstorm ideas about...", "generate a plan for..."
    *   *Primary Tool*: \`write_to_file\`.

*   **Action & Integration**: The user's request requires interaction with a service *outside* of Obsidian, such as a task manager or calendar.
    *   *Keywords*: "create a task...", "send an email to...", "schedule an event..."
    *   *Primary Tool*: \`use_mcp_tool\`.

## Step 2: Primary Tool Execution
Based on your intent analysis, select and execute the single most appropriate primary tool to get initial information.

## Step 3: Enhancement & Follow-up (If Needed)
After getting the primary tool result, decide if you need follow-up tools to complete the answer:

-   If \`search_files\` or \`dataview_query\` returned a list of notes and you need to understand their content → Use the \`insights\` tool on the relevant files or folders to extract key information.
-   If you need to examine specific raw content → Use \`read_file\` to get the full text of particular notes.
-   If you need to save your findings → Use \`write_to_file\` to create a new, well-structured summary note.

## Step 4: Answer Construction & Citation
Build your final response based on all collected and processed information. When the answer is based on vault content, you **MUST** use \`[[WikiLinks]]\` to cite all source notes you consulted.
`
}

function getLearnModeToolUseGuidelines(): string {
	return `# Tool Use Guidelines

## Learning-Focused Tool Selection

**Prioritize transformation tools to enhance learning and comprehension:**

- **simple_summary**: Create concise overviews for quick understanding
- **key_insights**: Extract core concepts and important ideas  
- **dense_summary**: Provide comprehensive yet condensed information
- **reflections**: Facilitate critical thinking about learning materials
- **table_of_contents**: Structure content for better navigation and learning flow
- **analyze_paper**: Deep analysis of research papers and academic content

## Learning Workflow

1. **Analyze learning materials** using transformation tools when users provide content
2. **Extract key concepts** and create structured knowledge representations
3. **Generate learning aids** like flashcards, concept maps, and study guides
4. **Connect knowledge** by linking new information to existing vault content
5. **Create learning plans** based on progress and learning objectives

## Tool Usage Principles

- Always start with transformation tools when processing learning materials
- Use Mermaid diagrams to create visual learning aids (concept maps, flowcharts)
- Generate structured study materials that promote active learning
- Focus on breaking complex topics into digestible, learnable chunks
- Wait for confirmation after each tool use before proceeding`
}

function getDefaultToolUseGuidelines(): string {
	return `# Tool Use Guidelines

## When to Use Transformation Tools

The tools like \`simple_summary\`, \`key_insights\`, \`dense_summary\`, \`reflections\`, \`table_of_contents\`, and \`analyze_paper\` are categorized as **Transformation Tools**.

**Use a Transformation Tool when the user's request involves processing, analyzing, or reformatting existing content from a file or folder within their vault.**

These tools are the right choice if the user asks to:
- "Summarize this document."
- "What are the key points in these notes?"
- "Analyze this research paper."
- "Create a table of contents for this folder."
- "Help me reflect on what I've written here."

Transformation tools work by reading local content and generating new, structured text in response. They **do not** search the web or modify the original files. Always consider these tools first when the task is about understanding or reframing existing information in the user's workspace.

## General Principles

1. In <thinking> tags, assess what information you already have and what information you need to proceed with the task.
2. Choose the most appropriate tool based on the task and the tool descriptions provided. Assess if you need additional information to proceed, and which of the available tools would be most effective for gathering this information. It's critical that you think about each available tool and use the one that best fits the current step in the task.
3. If multiple actions are needed, use one tool at a time per message to accomplish the task iteratively, with each tool use being informed by the result of the previous tool use. Do not assume the outcome of any tool use. Each step must be informed by the previous step's result.
4. Formulate your tool use using the XML format specified for each tool.
5. After each tool use, the user will respond with the result of that tool use. This result will provide you with the necessary information to continue your task or make further decisions. This response may include:
  - Information about whether the tool succeeded or failed, along with any reasons for failure.
  - Any other relevant feedback or information related to the tool use.
6. ALWAYS wait for user confirmation after each tool use before proceeding. Never assume the success of a tool use without explicit confirmation of the result from the user.

It is crucial to proceed step-by-step, waiting for the user's message after each tool use before moving forward with the task. This approach allows you to:
1. Confirm the success of each step before proceeding.
2. Address any issues or errors that arise immediately.
3. Adapt your approach based on new information or unexpected results.
4. Ensure that each action builds correctly on the previous ones.

By waiting for and carefully considering the user's response after each tool use, you can react accordingly and make informed decisions about how to proceed with the task. This iterative process helps ensure the overall success and accuracy of your work.`
}

export function getToolUseGuidelinesSection(mode?: string): string {
	if (mode === 'ask') {
		return getAskModeToolUseGuidelines()
	}
	if (mode === 'learn') {
		return getLearnModeToolUseGuidelines()
	}
	return getDefaultToolUseGuidelines()
}
