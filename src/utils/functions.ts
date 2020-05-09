import * as path from "path";
import * as vscode from "vscode";

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