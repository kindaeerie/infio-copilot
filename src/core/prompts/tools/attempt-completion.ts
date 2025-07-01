export function getAttemptCompletionDescription(): string {
	return `## attempt_completion
Description: Once you have gathered all necessary information from previous tool uses and are confident you can fully address the user's request, use this tool to present the final, complete answer. Ensure your response is conclusive and directly answers the user's query without requiring further interaction.
Parameters:
- result: The result of the task. Formulate this result in a way that is final and does not require further input from the user. Don't end your result with questions or offers for further assistance.
Usage:
<attempt_completion>
<result>
Your final result description here
</result>
</attempt_completion>`
}
