// import { promises as fs } from "fs"
// import * as path from "path"
// import * as vscode from "vscode"

import { ModeConfig, getAllModesWithPrompts } from "../../../utils/modes"

export async function getModesSection(): Promise<string> {
	// const settingsDir = path.join(context.globalStorageUri.fsPath, "settings")
	// await fs.mkdir(settingsDir, { recursive: true })
	// const customModesPath = path.join(settingsDir, "cline_custom_modes.json")

	// Get all modes with their overrides from extension state
	const allModes = await getAllModesWithPrompts()

	return `====

MODES

- These are the currently available modes:
${allModes.map((mode: ModeConfig) => `  * "${mode.name}" mode (${mode.slug}) - ${mode.roleDefinition.split(".")[0]}`).join("\n")}
`
}
