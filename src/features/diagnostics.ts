import { TsServer } from "../tsserver";
import * as vscode from "vscode";
import { DiagnosticKind } from "../utils/model";
import * as Proto from 'typescript/lib/protocol';
import { Diagnostic } from "typescript/lib/protocol";
import { SourceMapConsumer, NullableMappedPosition } from "source-map";
import { readFileSync } from "fs";
import { getPathNameExceptExtension } from "../utils/functions";

export function diagnostics(server: TsServer, context: vscode.ExtensionContext){
	const diagnostics= new Map<string, Diagnostic[]>();
	server.onDiagnosticsReceived((diag)=>{
		if ([DiagnosticKind.Semantic, DiagnosticKind.Syntax].includes(diag.kind)){
			diagnostics.set(`${diag.kind}:${diag.resource.path}`, diag.diagnostics);
		}
	})

	const collection = vscode.languages.createDiagnosticCollection();

	setInterval(()=>{
		const isTree= vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.fileName.endsWith(".tree");
		if (isTree){
			prepareDiagnostics(vscode.window.activeTextEditor!, diagnostics).then(diagnostics=>{
				if (isTree){
					collection.set(vscode.window.activeTextEditor!.document.uri, diagnostics);
				}
			})
		} else {
			collection.clear();
		}
	}, 100)
}

async function prepareDiagnostics(editor: vscode.TextEditor, diagnosticMap: Map<string, Proto.Diagnostic[]>){
	const pathName = getPathNameExceptExtension(editor.document);
	const sourceMapJson = JSON.parse(readFileSync(pathName + ".map", 'utf8'))
	const sourceMap = await new SourceMapConsumer(sourceMapJson);
	return [
		diagnosticMap.get(`${DiagnosticKind.Semantic}:${pathName}.ts`),
		diagnosticMap.get(`${DiagnosticKind.Syntax}:${pathName}.ts`)
	]
	.reduce((acc, diagnostics)=>{
		if (diagnostics){
			diagnostics.filter(item=> item.category === 'error').forEach(item=>{
				const start = sourceMap.originalPositionFor({
					column: item.start.offset-1,
					line: item.start.line
				})
				let end: Partial<NullableMappedPosition> = sourceMap.originalPositionFor({
					column: item.end.offset,
					line: item.end.line
				})

				if(!start.line || !start.column){
					return;
				}
				if (!end.column || !end.line){
					const wordRange = editor.document.getWordRangeAtPosition(new vscode.Position(start.line, start.column));
					
					end = {
						line: start.line,
						column : start.column + editor.document.getText(wordRange).length
					}
				}

				acc.push(<vscode.Diagnostic>{
					code: item.code,
					message: item.text,
					range: new vscode.Range(new vscode.Position(start.line! -1, start.column!), new vscode.Position(end.line! -1, end.column!))
				})
			})
		}
		return acc;
	}, [] as vscode.Diagnostic[])
}

export function getDignosticsKind(event: Proto.Event) {
	switch (event.event) {
		case 'syntaxDiag': return DiagnosticKind.Syntax;
		case 'semanticDiag': return DiagnosticKind.Semantic;
		case 'suggestionDiag': return DiagnosticKind.Suggestion;
	}
	throw new Error('Unknown dignostics kind');
}

