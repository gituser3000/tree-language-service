import { TsServer } from "./tsserver";
import * as vscode from 'vscode';
import * as path from 'path';
import { Disposable } from "./utils/dispose";
import { readFileSync, watch, FSWatcher } from "fs";
import { getGeneratedPathName } from "./utils/functions";

export class FileSynchronize extends Disposable {
	#syncedFiles = new Map<string, FSWatcher>()
	#server: TsServer

	constructor(server: TsServer) {
		super();
		this.#server = server;
		this.runSynchronise()
	}

	private runSynchronise() {
		vscode.workspace.onDidOpenTextDocument(this.openTextDocument, this, this._disposables);
		vscode.workspace.onDidCloseTextDocument(this.closeTextDocument, this, this._disposables);
		vscode.workspace.textDocuments.forEach(this.openTextDocument, this);
	}

	private openTextDocument(document: vscode.TextDocument) {
		if( !document.fileName.endsWith(".tree")){
			return;
		}
		const fileName = getGeneratedPathName(document);
		if (this.#syncedFiles.has(fileName)) {
			return true;
		}
		const watcher = watch(fileName, 'utf8', ()=>{
			this.#server.runDiagnosticRequest(fileName)
		})
		this.#server.openFileRequest(fileName, readFileSync(fileName, {encoding:'utf-8'}), this.getWorkspaceRootForResource(document.uri))
		this.#syncedFiles.set(fileName, watcher);
	}
	private closeTextDocument(document: vscode.TextDocument){
		if( !document.fileName.endsWith(".tree")){
			return;
		}
		const fileName = getGeneratedPathName(document);
		if (!this.#syncedFiles.has(fileName)) {
			return;
		}
		this.#syncedFiles.get(fileName)!.close();
		this.#syncedFiles.delete(fileName);
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