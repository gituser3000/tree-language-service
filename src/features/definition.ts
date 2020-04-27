import * as vscode from 'vscode';
import { getPathNameExceptExtension, getNameExceptExtension } from '../utils/functions';
import { readFileSync } from 'fs';
import { SourceMapConsumer } from 'source-map';
import { TsServer } from '../tsserver';
import { TREE_PATTERN } from '../utils/model';
import { CommandTypes } from 'typescript/lib/protocol';
import * as Proto from 'typescript/lib/protocol';

export class Definition {
    constructor(server: TsServer, context: vscode.ExtensionContext) {
     context.subscriptions.push(this._getTreeTsDefinitions(server))
    }

    private _getTreeTsDefinitions(server: TsServer){
        return vscode.languages.registerDefinitionProvider(TREE_PATTERN, {
            async provideDefinition(document, position, token) {
                const sourceMapJson = JSON.parse(readFileSync(getPathNameExceptExtension(document) + ".map", 'utf8'))
                const sourceMap = await new SourceMapConsumer(sourceMapJson);
                const genPos = sourceMap.generatedPositionFor({
                    column: position.character+1,
                    line: position.line+1,
                    source: getNameExceptExtension(document)
                })
                if (genPos.column === null || genPos.line === null){
                    return undefined;
                }

                const range = document.getWordRangeAtPosition(position, /[$\w]{1,}/);

                if (document.getText(range).startsWith("$")){
                    const response = await server.runSymbolLocationsRequest(CommandTypes.Definition,{
                        file: getPathNameExceptExtension(document)+".ts",
                        line: genPos.line,
                        offset: genPos.column+1
                    })
                    if (response.body){
                        console.log("response definitions:", response.body);
                        return mapSymbolResponse(document, position, response);
                    }
                }


                const response = await server.runSymbolLocationsRequest(CommandTypes.Implementation,{
                    file: getPathNameExceptExtension(document)+".ts",
                    line: genPos.line,
                    offset: genPos.column+1
                })

                if (response.body){
                    console.log("response implementations:", response.body);
                    return mapSymbolResponse(document, position, response);
                }

                console.log("go to tree.ts")
                const newUri = document.uri.with({
                    path: getPathNameExceptExtension(document)+".ts"
                });
                const targetRange = new vscode.Range(new vscode.Position(genPos.line! -1 ,genPos.column! + 1), new vscode.Position(genPos.line! -1 , genPos.column! + 1))
                return [
                    {
                        originSelectionRange: document.getWordRangeAtPosition(position),
                        targetUri: newUri,
                        targetRange: targetRange
    
                    }
                ] as vscode.LocationLink[]
            }
        })

        function mapSymbolResponse(document: vscode.TextDocument, position: vscode.Position, response: Proto.ImplementationResponse | Proto.DefinitionResponse): vscode.LocationLink[]{
            return response.body!.map(item=>{
                return {
                    originSelectionRange: document.getWordRangeAtPosition(position),
                    targetUri: document.uri.with({
                        path: item.file
                    }),
                    targetRange: new vscode.Range(new vscode.Position(item.start.line-1 , item.start.offset), new vscode.Position(item.end.line , item.end.offset))
                }
            })as vscode.LocationLink[]
        }
    }



 
}