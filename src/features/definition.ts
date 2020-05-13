import * as vscode from 'vscode';
import { getPathNameExceptExtension, getNameExceptExtension, getSourceMap } from '../utils/functions';
import { TsServer } from '../tsserver';
import { TREE_PATTERN } from '../utils/model';
import { CommandTypes } from 'typescript/lib/protocol';
import * as Proto from 'typescript/lib/protocol';

const SPECIAL_SYMBOLS = /(<=>|<=|=>|\*|\\|\/|@)/;

export function definition(server: TsServer, context: vscode.ExtensionContext) {
    context.subscriptions.push(getTreeTsDefinitions(server))
}

function getTreeTsDefinitions(server: TsServer) {
    return vscode.languages.registerDefinitionProvider(TREE_PATTERN, {
        async provideDefinition(document, position, token) {
            const sourceMap = await getSourceMap(document);
            const genPos = sourceMap.generatedPositionFor({
                column: position.character + 1,
                line: position.line + 1,
                source: getNameExceptExtension(document)
            })
            if (genPos.column === null || genPos.line === null) {
                return undefined;
            }

            //  go to component definition
            const range = document.getWordRangeAtPosition(position, /[$\w]{1,}/);
            if (document.getText(range).startsWith("$")) {
                const response = await server.runSymbolLocationsRequest(CommandTypes.Definition, {
                    file: getPathNameExceptExtension(document) + ".ts",
                    line: genPos.line,
                    offset: genPos.column + 1
                })
                if (response.body) {
                    return mapSymbolResponse(document, position, response);
                }
            }


            // go to generated tree.ts in case implementations and definitions are not needed
            const lineFromCharacter = document.lineAt(position.line).text.substr(position.character);
            const lineBeforeCharacter = document.lineAt(position.line).text.substr(0, position.character);

            if (lineFromCharacter.match(SPECIAL_SYMBOLS) && !lineBeforeCharacter.match(SPECIAL_SYMBOLS)) {
                const newUri = document.uri.with({
                    path: getPathNameExceptExtension(document) + ".ts"
                });
                const targetRange = new vscode.Range(new vscode.Position(genPos.line! - 1, genPos.column! + 1), new vscode.Position(genPos.line! - 1, genPos.column! + 1))
                return [
                    {
                        originSelectionRange: document.getWordRangeAtPosition(position),
                        targetUri: newUri,
                        targetRange: targetRange

                    }
                ] as vscode.LocationLink[]
            }

            // go to implementations otherwise
            const response = await server.runSymbolLocationsRequest(CommandTypes.Implementation, {
                file: getPathNameExceptExtension(document) + ".ts",
                line: genPos.line,
                offset: genPos.column + 1
            })

            if (response.body) {
                return mapSymbolResponse(document, position, response);
            }

        }
    })

    function mapSymbolResponse(document: vscode.TextDocument, position: vscode.Position, response: Proto.ImplementationResponse | Proto.DefinitionResponse): vscode.LocationLink[] {
        return response.body!
            .filter(item => !item.file.endsWith("object2/object2.ts"))
            .map(item => {
                return {
                    originSelectionRange: document.getWordRangeAtPosition(position),
                    targetUri: document.uri.with({
                        path: item.file
                    }),
                    targetRange: new vscode.Range(new vscode.Position(item.start.line - 1, item.start.offset), new vscode.Position(item.end.line, item.end.offset))
                }
            }) as vscode.LocationLink[]
    }
}