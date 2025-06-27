import { ToolArgs } from "../tools/types"


export function getFetchUrlsContentDescription(_args: ToolArgs): string {
	return `## fetch_urls_content
Description:
This tool allows you to fetch the content of multiple web pages. It retrieves the HTML content and returns it in a readable format. Use this tool when you need to analyze, extract information from, or understand the content of specific web pages.
Parameters:
- urls: (required) A JSON array of URLs to fetch content from. Each URL should be a complete URL including the protocol (http:// or https://).
  - Maximum: 10 URLs per request
Usage:
<fetch_urls_content>
<urls>
[
  "https://example.com/page1",
  "https://example.com/page2"
]
</urls>
</fetch_urls_content>

Example:
<fetch_urls_content>
<urls>
[
  "https://en.wikipedia.org/wiki/Artificial_intelligence",
  "https://github.com/features/copilot"
]
</urls>
</fetch_urls_content>
`
} 
