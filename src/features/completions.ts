import * as vscode from 'vscode';
import { getPathNameExceptExtension, getNameExceptExtension } from '../utils/functions';
import { readFileSync } from 'fs';
import { SourceMapConsumer } from 'source-map';
import { TsServer } from '../tsserver';
import { CompletionItemKind } from 'vscode';

export class Completions {
    constructor(server: TsServer, context: vscode.ExtensionContext) {
        context.subscriptions.push(
            this._getComponentCreateCompletion(),
            this.getTsCompletions(server)
        )
    }

    private _getComponentCreateCompletion() {
        return vscode.languages.registerCompletionItemProvider({ pattern: '**/*.tree' }, {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                if (document.lineAt(position.line).text.length === 0) {
                    const snippetCompletion = new vscode.CompletionItem('$');
                    snippetCompletion.insertText = new vscode.SnippetString('$${1:element} $');
                    return [snippetCompletion];
                }
                return undefined;
            }
        })
    }

    private getTsCompletions(server: TsServer) {
        return vscode.languages.registerCompletionItemProvider(
            { pattern: '**/*.tree' },
            {
                provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                    if (document.getText().length === 0) return undefined;
                    const pathName = getPathNameExceptExtension(document);
                    console.log(pathName);
                    const sourceMapJson = JSON.parse(readFileSync(getPathNameExceptExtension(document) + ".map", 'utf8'))
                    return new SourceMapConsumer(sourceMapJson).then(consumer => {
                        const generatedPosition = consumer.generatedPositionFor({
                            column: position.character + 1,
                            line: position.line + 1,
                            source: getNameExceptExtension(document)
                        })

                        const wordRange = document.getWordRangeAtPosition(position, /[$\w]{1,}/);
                        return server.runCompletionsRequest({
                            prefix: wordRange ? document.getText(wordRange?.with(undefined, position)) : "",
                            file: pathName + ".ts",
                            line: generatedPosition.line!,
                            offset: generatedPosition.column! + 1
                        }).then(response => {
                            console.log("completion response:", response);
                            return response.body?.entries
                                .filter(item => ["class", "method"].includes(item.kind))
                                .map(item => {
                                    const kind = item.kind === "method" ? CompletionItemKind.Method : CompletionItemKind.Class
                                    const resultItem: vscode.CompletionItem = { ...item, label: item.name, kind };
                                    return resultItem;
                                });
                        })
                    })
                }
            }
        )
    }
}