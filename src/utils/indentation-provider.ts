import { indentLess, indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";

export const getIndentByTabExtension = (): Extension[] =>
	[
		keymap.of([indentWithTab]),
		indentUnit.of("    ")
	];

export const getInsertTabsExtension = (): Extension[] =>
	[
		keymap.of([
			// {
			// 	key: 'Tab',
			// 	preventDefault: true,
			// 	run: insertTab,
			// },
			{
				key: 'Shift-Tab',
				preventDefault: true,
				run: indentLess,
			},
		])
	];
