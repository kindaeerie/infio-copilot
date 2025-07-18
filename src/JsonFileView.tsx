
import { json } from "@codemirror/lang-json";
import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { WorkspaceLeaf } from "obsidian";

import BaseView from "./BaseFileView";
import { JSON_VIEW_TYPE } from './constants';
import InfioPlugin from './main';
import { getIndentByTabExtension } from "./utils/indentation-provider";

export default class JsonView extends BaseView {
	constructor(leaf: WorkspaceLeaf, plugin: InfioPlugin) {
		super(leaf, plugin);
	}

	getViewType(): string {
		return JSON_VIEW_TYPE;
	}

	protected getEditorExtensions(): Extension[] {
		const extensions = [
			basicSetup,
			getIndentByTabExtension(),
			json(),
			EditorView.updateListener.of(this.onEditorUpdate.bind(this))
		];

		return extensions;
	}
}
