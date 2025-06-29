
import { Platform } from 'obsidian';


export function getSystemInfoSection(cwd: string): string {
	let platformName = "Unknown"
	if (Platform.isMacOS) {
		platformName = "Macos"
	} else if (Platform.isWin) {
		platformName = "Windows"
	} else if (Platform.isLinux) {
		platformName = "Linux"
	} else if (Platform.isMobileApp) {
		if (Platform.isTablet) {
			platformName = "iPad"
		} else if (Platform.isPhone) {
			platformName = "iPhone"
		} else if (Platform.isAndroidApp) {
			platformName = "Android"
		}
	} else {
		platformName = "Unknown"
	}
	const details = `====

SYSTEM INFORMATION

Platform: ${platformName}
Current Obsidian Directory: ${cwd.toPosix()}
`

	return details
}
