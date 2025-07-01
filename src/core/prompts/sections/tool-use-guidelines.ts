function getAskModeToolUseGuidelines(): string {
	return `# STRATEGY & EXECUTION

Your interaction with the user follows a structured workflow to ensure clarity and efficiency. You will use \`<thinking>\`, \`<communication>\`, and tool calls to solve tasks.

**1. The Thinking Phase (\`<thinking>\`):**
The \`<thinking>\` tag is used for analysis and planning. Use it ONLY in these scenarios:
* **Initial Task Planning**: When the user provides a new task, analyze the request and create a step-by-step plan.
* **Processing Feedback**: When the user provides feedback, analyze it and plan your next actions.
* **Re-planning after Failure**: If a tool call fails or produces unexpected results, analyze and create a revised plan.

**2. The Communication Phase (\`<communication>\`):**
Keep the user informed about your progress:
* **After Planning**: Briefly inform the user of your plan before executing the first tool call.
* **After Tool Results**: Provide status updates explaining what the result was, how it helps, and what you will do next.

**3. The Execution Phase (Tool Calls):**
Execute tool calls as defined in your plan. You can execute multiple tool calls in parallel if they are independent.

**Example Workflow:**

User Request: \`<task>Compare file_A.md and file_B.md</task>\`

Your Response:
\`\`\`
<thinking>
The user wants to compare two files.
**Plan:**
1. Read both files in parallel
2. Analyze differences and summarize
3. Present final comparison
</thinking>

<communication>
I will read both files to prepare a comparison for you.
</communication>

<read_file>
<path>file_A.md</path>
</read_file>

<read_file>
<path>file_B.md</path>
</read_file>
\`\`\``;
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
- Wait for confirmation after each tool use before proceeding`;
}

function getDefaultToolUseGuidelines(): string {
	return `# Tool Use Guidelines

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

By waiting for and carefully considering the user's response after each tool use, you can react accordingly and make informed decisions about how to proceed with the task. This iterative process helps ensure the overall success and accuracy of your work.`;
}

export function getToolUseGuidelinesSection(mode?: string): string {
	if (mode === 'ask') {
		return getAskModeToolUseGuidelines();
	}
	if (mode === 'learn') {
		return getLearnModeToolUseGuidelines();
	}
	return getDefaultToolUseGuidelines();
}
