import * as vscode from 'vscode';
import { getPathNameExceptExtension, getNameExceptExtension } from '../utils/functions';
import { readFileSync } from 'fs';
import { SourceMapConsumer } from 'source-map';
import { TsServer } from '../tsserver';
import { CompletionItemKind } from 'vscode';
import { TREE_PATTERN } from '../utils/model';


export function completions(server: TsServer, context: vscode.ExtensionContext) {
    context.subscriptions.push(
        getComponentCreateCompletion(),
        getTsCompletions(server)
    )
}

function getComponentCreateCompletion() {
    return vscode.languages.registerCompletionItemProvider(TREE_PATTERN, {
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

function getTsCompletions(server: TsServer) {
    return vscode.languages.registerCompletionItemProvider(
        TREE_PATTERN,
        {
            async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                if (document.getText().length === 0) return undefined;
                const pathName = getPathNameExceptExtension(document);
                const sourceMapJson = JSON.parse(readFileSync(getPathNameExceptExtension(document) + ".map", 'utf8'))
                const consumer = await new SourceMapConsumer(sourceMapJson);
                const generatedPosition = consumer.generatedPositionFor({
                    column: position.character + 1,
                    line: position.line + 1,
                    source: getNameExceptExtension(document)
                })

                const wordRange = document.getWordRangeAtPosition(position, /[$\w]{1,}/);
                const response = await server.runCompletionsRequest({
                    prefix: wordRange ? document.getText(wordRange?.with(undefined, position)) : "",
                    file: pathName + ".ts",
                    line: generatedPosition.line!,
                    offset: generatedPosition.column! + 1
                })
                return response.body?.entries
                    .filter(item => ["class", "method"].includes(item.kind))
                    .map(item => {
                        const kind = item.kind === "method" ? CompletionItemKind.Method : CompletionItemKind.Class
                        const resultItem: vscode.CompletionItem = { ...item, label: item.name, kind };
                        return resultItem;
                    });
            }
        }
    )
}