import * as vscode from 'vscode';
import { getPathNameExceptExtension, getNameExceptExtension } from '../utils/functions';
import { readFileSync } from 'fs';
import { SourceMapConsumer } from 'source-map';
import { TsServer } from '../tsserver';
import { TREE_PATTERN } from '../utils/model';

export class Definition {
    constructor(server: TsServer, context: vscode.ExtensionContext) {
     context.subscriptions.push(this._getTsDefinitions(server))
    }

    private _getTsDefinitions(server: TsServer){
        return vscode.languages.registerDefinitionProvider(TREE_PATTERN, {
            async provideDefinition(document, position, token) {
                const newUri = document.uri.with({
                    path: getPathNameExceptExtension(document)+".ts"
                });
                const sourceMapJson = JSON.parse(readFileSync(getPathNameExceptExtension(document) + ".map", 'utf8'))
                console.log("position before sourcemap!:", position.line+1, ":", position.character+1);
                const consumer = await new SourceMapConsumer(sourceMapJson);
                const generatedPosition = consumer.generatedPositionFor({
                    column: position.character+1,
                    line: position.line+1,
                    source: getNameExceptExtension(document)
                })
                console.log("gen pos!:", generatedPosition.line + " : "+ generatedPosition.column);
                const range = new vscode.Range(new vscode.Position(generatedPosition.line! -1 ,generatedPosition.column! + 1), new vscode.Position(generatedPosition.line! -1 , generatedPosition.column! + 1))
                const response = {
                    originSelectionRange: document.getWordRangeAtPosition(position),
                    targetUri: newUri,
                    targetRange: range

                };
                console.log(response);
                return [
                    response
                ] as vscode.LocationLink[]
            }
        })

    }



 
}