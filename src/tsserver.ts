import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as vscode from 'vscode';

import * as Proto from 'typescript/lib/protocol';
import { Reader } from "./wireProtocol";
import { Disposable } from "./utils/dispose";
import { EOL, platform } from "os";
import { CommandTypes } from "typescript/lib/protocol";
import { TsDiagnostics } from "./utils/model";
import { getDignosticsKind } from "./features/diagnostics";
import { normalize } from "path";

interface RequestCallback {
	resolve: Function;
	reject: Function;
}

type Request<T> = Omit<T, 'type' | 'seq'>

export class TsServer extends Disposable {
	#process!: cp.ChildProcess;
	#reader!: Reader<Proto.Response>;
	#seq = 1;
	#callbacks: { [a: number]: RequestCallback } = {}

	readonly #onDiagnosticsReceived = this._register(new vscode.EventEmitter<TsDiagnostics>());
	readonly onDiagnosticsReceived = this.#onDiagnosticsReceived.event;

	constructor() {
		super();
		const args = [
			// '--logFile', '/home/osboxes/Documents/custom_tsserver.log',
			"--logVerbosity", "verbose",
			"--locale", "en",
			"--useInferredProjectPerProjectRoot",
			"--disableAutomaticTypingAcquisition",
			"--cancellationPipeName", `/tmp/vscode-tree-language-service/tree-req-cancellation${Date.now()}*`,
			"--validateDefaultNpmLocation"
    ];
    
		this.#process = cp.fork(this._getWorkspaceTsPath(), args, { 
			stdio: 'pipe',
			detached: platform() === 'win32' ? false : true,
			cwd: process.cwd()
		 });

		this.#reader = this._register(new Reader<Proto.Response>(this.#process.stdout));
		this.listenResponses();
	}

	private listenResponses() {
		this.#reader.onData(msg => this.dispatchMessage(msg));
	}

	private _getWorkspaceTsPath(): string {
		const nodePath = path.join('node_modules', 'typescript', 'lib', "tsserver.js");
		const workspacePath = vscode.workspace.workspaceFolders?.find(item => {
			const pathToTs = path.join(item.uri.fsPath, nodePath);
			if (fs.existsSync(pathToTs)) {
				return pathToTs
			}
		})?.uri.fsPath
		if (!workspacePath) {
			throw Error('Typescript in workspace is absent')
    }
		return path.join(workspacePath!, nodePath);
	}

	public runSymbolLocationsRequest(type: CommandTypes.Implementation , data: Proto.FileLocationRequestArgs): Promise<Proto.ImplementationResponse>
	public runSymbolLocationsRequest(type: CommandTypes.Definition , data: Proto.FileLocationRequestArgs): Promise<Proto.DefinitionResponse>
	public runSymbolLocationsRequest(type: CommandTypes.Implementation | CommandTypes.Definition , data: Proto.FileLocationRequestArgs){
		const request: Request<Proto.ImplementationRequest | Proto.DefinitionRequest> = { 
			command: type,
			arguments: data
		};
		return this.runRequestWithResponse(request) ;
	}

	public runCompletionsRequest(data: Proto.CompletionsRequestArgs){
		const request: Request<Proto.CompletionsRequest> = { 
			command: CommandTypes.CompletionInfo,
			arguments: data
		};
		return this.runRequestWithResponse(request) as Promise<Proto.CompletionInfoResponse>;
	}

	public runRenameRequest(file: string, line: number, offset: number){
		const request: Request<Proto.RenameRequest> = {
			command: CommandTypes.Rename,
			arguments: {
				file,
				line,
				offset
			}
		}
		return this.runRequestWithResponse(request) as Promise<Proto.RenameResponse>;
	}

	private runRequestWithResponse(request: any){
		return new Promise((resolve, reject) => {
			this.#callbacks[this.#seq] = {
				resolve, reject
			}
			this.runRequestWithoutWaitingForResponse(request)
		})
	}

	public async runDiagnosticRequest(file: string){
		const request: Request<Proto.GeterrRequest> = {
			command: CommandTypes.Geterr,
			arguments: {
				delay: 0,
				files: [file]
			}
		}
		await this.runReloadRequest(file);
		this.runRequestWithoutWaitingForResponse(request);
	}

	private runReloadRequest(file: string){
		const request: Request<Proto.ReloadRequest> = {
			command: CommandTypes.Reload,
			arguments: {
				file: file,
				tmpfile: file
			}
		}
		return this.runRequestWithResponse(request);
	}

	public openFileRequest(filepath: string, fileContent: string, projectRootPath?: string) {
		const request: Request<Proto.OpenRequest> = {
			command: CommandTypes.Open,
			arguments: {
				file: filepath,
				// fileContent: this.document.getText(),
				fileContent: fileContent,
				// projectRootPath: this.client.getWorkspaceRootForResource(this.document.uri),
				projectRootPath: projectRootPath
			}
		};
		this.runRequestWithoutWaitingForResponse(request);
	}

	private getBasicRequestArgs(){
		return {
			type: "request" as 'request',
			seq: this.#seq++,
		}
	}

	public closeFileRequest(path: string){
		const request: Request<Proto.CloseRequest>= {
			command: CommandTypes.Close,
			arguments: {
				file: path
			}
		}
		this.runRequestWithoutWaitingForResponse(request);
	}

	private runRequestWithoutWaitingForResponse(request: any) {
		request = {
			...request,
			...this.getBasicRequestArgs()
		}
		try {
			this.#process.stdin.write(JSON.stringify(request) + EOL)
		} catch (e) {
			console.log(e)
		}
	}

	private dispatchMessage(message: Proto.Message) {
		// console.log("response:", message);
		try {
			switch (message.type) {
				case 'response':
					this.dispatchResponse(message as Proto.Response);
					break;

				case 'event':
					const event = message as Proto.Event;
					if (event.event === 'requestCompleted') {
						const seq = (event as Proto.RequestCompletedEvent).body.request_seq;
						const callback = this.#callbacks[seq];
						if (callback) {
              				delete this.#callbacks[seq];
							// this._tracer.traceRequestCompleted(this._serverId, 'requestCompleted', seq, callback);
							callback.resolve(event);
						}
					} else {
						// this._tracer.traceEvent(this._serverId, event);
						// this._onEvent.fire(event);
						this.dispatchEvent(event);
					}
					break;

				default:
					throw new Error(`Unknown message type ${message.type} received`);
			}
		} finally {
			// this.sendNextRequests();
		}
	}

	private dispatchResponse(response: Proto.Response) {
		const callback = this.#callbacks[response.request_seq];
		if (!callback) {
			return;
		}
		delete this.#callbacks[response.request_seq];

		// this._tracer.traceResponse(this._serverId, response, callback);
		if (response.success) {
			callback.resolve(response);
		} else if (response.message === 'No content available.') {
			// Special case where response itself is successful but there is not any data to return.
			// callback.resolve(ServerResponse.NoContent);
		} else {
			// callback.onError(TypeScriptServerError.create(this._serverId, this._version, response));
		}
	}

	private dispatchEvent(event: Proto.Event) {
		switch (event.event) {
			case 'syntaxDiag':
			case 'semanticDiag':
			case 'suggestionDiag':
				const diagnosticEvent = event as Proto.DiagnosticEvent;
				if (diagnosticEvent.body && diagnosticEvent.body.diagnostics) {
					this.#onDiagnosticsReceived.fire({
						kind: getDignosticsKind(event),
						resource: normalize(diagnosticEvent.body.file),
						diagnostics: diagnosticEvent.body.diagnostics
					});
					
				}
				break;
			}
	}

}