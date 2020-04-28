import * as vscode from 'vscode';
import { TsServer } from './tsserver';
import { FileSynchronize } from './fileSynchronize';
import { Completions } from './features/completions';
import { Definition } from './features/definition';

export function activate(context: vscode.ExtensionContext) {

	try {
		const server = new TsServer();
		const fileSync = new FileSynchronize(server);
		// const completions = new Completions(server, context);
		const definition = new Definition(server, context);
	} catch (e) {
		console.log("INITIALIZATION FAIL: ", e);
	}
}
