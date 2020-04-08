import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as vscode from 'vscode';

import * as Proto from 'typescript/lib/protocol';
import { Reader } from "./wireProtocol";
import { Disposable } from "./utils/dispose";
import { EOL } from "os";
import { CommandTypes } from "typescript/lib/protocol";

interface RequestCallback {
	resolve: Function;
	reject: Function;
}

export class TsServer extends Disposable {
	#process!: cp.ChildProcess;
	#reader!: Reader<Proto.Response>;
	#seq = 1;
	#callbacks: { [a: number]: RequestCallback } = {}

	constructor() {
		super();
		const args = [
			'--logFile', '/home/osboxes/Documents/custom_tsserver.log',
			"--logVerbosity", "verbose",
			"--locale", "en",
			"--useInferredProjectPerProjectRoot",
			"--disableAutomaticTypingAcquisition",
			"--cancellationPipeName", `/tmp/vscode-tree-language-service/tree-req-cancellation${Date.now()}*`,
			"--validateDefaultNpmLocation"
		];
		this.#process = cp.fork(this._getWorkspaceTsPath(), args, { stdio: 'pipe' });
		this.#reader = this._register(new Reader<Proto.Response>(this.#process.stdout));
		this.listenResponses();
	}

	private listenResponses() {
		this.#reader.onData(msg => this.dispatchMessage(msg));
	}

	private _getWorkspaceTsPath(): string {
		const nodePath = path.join('node_modules', 'typescript', 'lib', "tsserver.js");
		const workspacePath = vscode.workspace.workspaceFolders?.find(item => {
			const pathToTs = path.join(item.uri.path, nodePath);
			if (fs.existsSync(pathToTs)) {
				return pathToTs
			}
		})?.uri.path
		if (!workspacePath) {
			throw Error('Typescript in workspace is absent')
		}
		return path.join(workspacePath!, nodePath);
	}

	public runCompletionsRequest(data: Proto.CompletionsRequestArgs): Promise<Proto.CompletionInfoResponse> {
		return new Promise((resolve, reject) => {
			this.#callbacks[this.#seq] = {
				resolve, reject
			}
			const request: Proto.CompletionsRequest = { 
				command: CommandTypes.CompletionInfo,
				arguments: data,
				...this.getBasicRequestArgs()
			};
			console.log("completions request:", request);
			this.runRequestWithoutWaitingForResponse(request)
		})
	}

	public openFileRequest(filepath: string, fileContent: string, projectRootPath?: string) {
		const request: Proto.OpenRequest = {
			...this.getBasicRequestArgs(),
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
		const request: Proto.CloseRequest= {
			...this.getBasicRequestArgs(),
			command: CommandTypes.Close,
			arguments: {
				file: path
			}
		}
		this.runRequestWithoutWaitingForResponse(request);
	}

	private runRequestWithoutWaitingForResponse(request: any) {
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
						console.log("request seq", seq);
						const callback = this.#callbacks[seq];
						if (callback) {
							// this._tracer.traceRequestCompleted(this._serverId, 'requestCompleted', seq, callback);
							callback.resolve(event);
						}
					} else {
						// this._tracer.traceEvent(this._serverId, event);
						// this._onEvent.fire(event);
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

}