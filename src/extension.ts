import * as vscode from 'vscode';
import { TsServer } from './tsserver';
import { FileSynchronize } from './fileSynchronize';
import { completions } from './features/completions';
import { definition } from './features/definition';
import { diagnostics } from './features/diagnostics';
import { refactoring } from './features/refactoring';

export function activate(context: vscode.ExtensionContext) {

	try {
		const server = new TsServer();
		const fileSync = new FileSynchronize(server);
		// completions(server, context);
		definition(server, context);
		diagnostics(server, context);
		refactoring(server,context);
	} catch (e) {
		console.log("INITIALIZATION FAIL: ", e);
	}
}
