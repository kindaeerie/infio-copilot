export function getAskFollowupQuestionDescription(): string {
	return `## ask_followup_question
Description: Ask the user a question to gather additional information needed to complete the task. This tool should be used when you encounter ambiguities, need clarification, or require more details to proceed effectively. It allows for interactive problem-solving by enabling direct communication with the user. Use this tool judiciously to maintain a balance between gathering necessary information and avoiding excessive back-and-forth.
Parameters:
- question: (required) The question to ask the user. This should be a clear, specific question that addresses the information you need.
Usage:
<ask_followup_question>
<question>Your question here</question>
</ask_followup_question>

Example: Requesting to ask the user for their preferred citation style for an academic document
<ask_followup_question>
<question>Which citation style would you like to use for your academic paper (APA, MLA, Chicago, etc.)?</question>
</ask_followup_question>`
}
