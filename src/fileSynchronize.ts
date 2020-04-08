import { TsServer } from "./tsserver";
import * as vscode from 'vscode';
import * as path from 'path';
import { Disposable } from "./utils/dispose";
import { readFileSync } from "fs";
import { getPathNameExceptExtension } from "./utils/functions";

export class FileSynchronize extends Disposable {
	#syncedFiles = new Map<string, { resource: string, value: any }>()
	#server: TsServer

	constructor(server: TsServer) {
		super();
		this.#server = server;
		this.runSynchronise()
	}

	private runSynchronise() {
		vscode.workspace.onDidOpenTextDocument(this.openTextDocument, this, this._disposables);
		vscode.workspace.onDidCloseTextDocument(this.closeTextDocument, this, this._disposables);
		vscode.workspace.onDidChangeTextDocument(this.changeTextDocument, this, this._disposables);
		vscode.window.onDidChangeVisibleTextEditors(e => {
			// for (const { document } of e) {
			// 	const syncedBuffer = this.syncedBuffers.get(document.uri);
			// 	if (syncedBuffer) {
			// 		this.requestDiagnostic(syncedBuffer);
			// 	}
			// }
		}, this, this._disposables);
		vscode.workspace.textDocuments.forEach(this.openTextDocument, this);
	}

	public changeTextDocument(e: vscode.TextDocumentChangeEvent){
		// trigger diagnostics
	}

	private openTextDocument(document: vscode.TextDocument) {
		if( !document.fileName.endsWith(".tree")){
			return;
		}
		const resource = document.fileName;
		const fileName = getPathNameExceptExtension(document) + ".ts";

		if (this.#syncedFiles.has(fileName)) {
			return true;
		}
		this.#syncedFiles.set(fileName, { resource, value: true });
		this.#server.openFileRequest(fileName, readFileSync(fileName, {encoding:'utf-8'}), this.getWorkspaceRootForResource(document.uri))
	}
	private closeTextDocument(document: vscode.TextDocument){
		if( !document.fileName.endsWith(".tree")){
			return;
		}
		const syncedFile = this.#syncedFiles.get(document.fileName);
		if (!syncedFile) {
			return;
		}
		const fileName = getPathNameExceptExtension(document) + ".ts"
		this.#syncedFiles.delete(fileName);
		// this.pendingDiagnostics.delete(resource);
		// this.pendingGetErr?.files.delete(resource);
		// this.requestAllDiagnostics();

		this.#server.closeFileRequest(fileName);
	}

	public getWorkspaceRootForResource(resource: vscode.Uri): string | undefined {
		const roots = vscode.workspace.workspaceFolders ? Array.from(vscode.workspace.workspaceFolders) : undefined;
		if (!roots || !roots.length) {
			return undefined;
		}

		for (const root of roots.sort((a, b) => a.uri.fsPath.length - b.uri.fsPath.length)) {
			if (resource.fsPath.startsWith(root.uri.fsPath + path.sep)) {
				return root.uri.fsPath;
			}
		}
		return roots[0].uri.fsPath;

		return undefined;
	}
}