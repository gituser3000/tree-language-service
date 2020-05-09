import * as vscode from "vscode";
import * as Proto from 'typescript/lib/protocol';

export const TREE_PATTERN = { pattern: "**/*.view.tree"};

export const enum DiagnosticKind {
	Syntax,
	Semantic,
	Suggestion,
}
export interface TsDiagnostics {
	readonly kind: DiagnosticKind;
	readonly resource: string;
	readonly diagnostics: Proto.Diagnostic[];
}