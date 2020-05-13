import * as vscode from 'vscode';
import * as Proto from 'typescript/lib/protocol';

import { TsServer } from '../tsserver';
import { TREE_PATTERN } from '../utils/model';
import { getSourceMap, getNameExceptExtension, getPathNameExceptExtension } from '../utils/functions';

const SPECIAL_SYMBOLS = /(<=>|<=|=>|\*|\\|\/|@)/;

export function refactoring(server: TsServer, context: vscode.ExtensionContext) {
    context.subscriptions.push(treeToTsRename(server))
}

function treeToTsRename(server: TsServer){
    return vscode.languages.registerRenameProvider(TREE_PATTERN, {
        async provideRenameEdits(document, position, newName, token){
            const sourceMap = await getSourceMap(document);
            const genPos = sourceMap.generatedPositionFor({
                column: position.character,
                line: position.line + 1,
                source: getNameExceptExtension(document)
            });

            const fileName = getPathNameExceptExtension(document)+ ".ts";
            const response = await server.runRenameRequest(fileName, genPos.line!, genPos.column!);
            if (!response.success || !response.body){
                
            }else {
                const edit = generateWorkspaceEdit(response.body.locs, newName);
                edit.replace(document.uri, document.getWordRangeAtPosition(position)!, newName);
                return edit;
            }
        }
    })
}

function generateWorkspaceEdit(
    locations: ReadonlyArray<Proto.SpanGroup>,
    newName: string
) {
    const edit = new vscode.WorkspaceEdit();
    for (const spanGroup of locations) {
        const resource = vscode.Uri.parse(spanGroup.file);
        for (const textSpan of spanGroup.locs) {
            edit.replace(resource, rangeFromTextSpan(textSpan),
                (textSpan.prefixText || '') + newName + (textSpan.suffixText || ''));
        }
    }
    return edit;
}

function rangeFromTextSpan(span: Proto.TextSpan) {
    return new vscode.Range(
        Math.max(0, span.start.line - 1), Math.max(span.start.offset - 1, 0),
        Math.max(0, span.end.line - 1), Math.max(0, span.end.offset - 1))
};