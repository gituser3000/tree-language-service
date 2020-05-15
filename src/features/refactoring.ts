import * as vscode from 'vscode';
import * as Proto from 'typescript/lib/protocol';
import * as path from "path";

import { TsServer } from '../tsserver';
import { TREE_PATTERN } from '../utils/model';
import { getSourceMap, getNameExceptExtension, getPathNameExceptExtension } from '../utils/functions';
import { BasicSourceMapConsumer } from 'source-map';

export function refactoring(server: TsServer, context: vscode.ExtensionContext) {
    context.subscriptions.push(treeToTsRename(server), tsToTreeRename(server))
}

function tsToTreeRename(server:TsServer){
    return vscode.languages.registerRenameProvider({ pattern: "**/*.ts"}, {
        async provideRenameEdits(document, position, newName, token){
            const sourceMap = await getSourceMap(document);
            const response = await server.runRenameRequest(document.fileName, position.line, position.character);
            if (!response.success || !response.body){
                
            }else {
                const edit = new vscode.WorkspaceEdit();
                addTreeFilesToEdit(response.body.locs, edit, newName, sourceMap);
                return edit;
            }
        }
    })
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
                addTreeFilesToEdit(response.body.locs, edit, newName, sourceMap);
                return edit;
            }
        }
    })
}

function addTreeFilesToEdit(locations: readonly Proto.SpanGroup[], edit: vscode.WorkspaceEdit, newName: string, sourceMap: BasicSourceMapConsumer){
    for (const spanGroup of locations) {
        if (!spanGroup.file.endsWith("*.tree.ts")) return;
        const pathName = spanGroup.file.split(path.sep+"view.tree"+ path.sep);
        const resource = vscode.Uri.parse(pathName[0]+path.sep+pathName[1].substring(0, -3));
        for (const textSpan of spanGroup.locs) {
            const start = sourceMap.originalPositionFor({ column:textSpan.start.offset, line: textSpan.start.line})
            const end = sourceMap.originalPositionFor({ column:textSpan.end.offset, line: textSpan.end.line})
            const range = new vscode.Range(new vscode.Position(start.line!, start.column!), new vscode.Position(end.line!, end.column!))
            edit.replace(resource, range, newName);
        }
    }
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