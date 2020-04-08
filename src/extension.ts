/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';
import { TsServer } from './tsserver';
import { FileSynchronize } from './fileSynchronize';
import { Completions } from './features/completions';

export function activate(context: vscode.ExtensionContext) {

	try {
		const server = new TsServer();
		const fileSync = new FileSynchronize(server);
		const completions = new Completions(server, context);
	} catch (e) {
		console.log("INITIALIZATION FAIL: ", e);
	}
}
