import * as path from "path";
import * as vscode from "vscode";
import { SourceMapConsumer } from "source-map";
import { readFileSync } from "fs";

export function getNameExceptExtension(document: vscode.TextDocument){
    const pathItems = document.fileName.split(path.sep);
    const fileName = pathItems.pop()!;
    return fileName;
}
export function getPathNameExceptExtension(document: vscode.TextDocument){
    const pathItems = document.fileName.split(path.sep);
    const fileName = pathItems.pop()!;
    pathItems.push('-view.tree', fileName);
    return pathItems.join(path.sep);
}
export function getGeneratedPathName(document: vscode.TextDocument){
    return getPathNameExceptExtension(document) + ".ts";
}

export async function getSourceMap(document: vscode.TextDocument){
	const pathName = getPathNameExceptExtension(document);
	const sourceMapJson = JSON.parse(readFileSync(pathName + ".map", 'utf8'))
    return new SourceMapConsumer(sourceMapJson);
}