import { TsServer } from "../tsserver";
import * as vscode from 'vscode';
//@ts-ignore
import * as nthline from 'nthline';
import { getSourceMap, getNameExceptExtension, getPathNameExceptExtension } from "../utils/functions";
import { CommandTypes } from "typescript/lib/protocol";
import { EOL } from "os";
import { writeFileSync, readFileSync } from "fs";

export function implementAndNavigate(server: TsServer, context: vscode.ExtensionContext) {
    context.subscriptions.push(registerImplementNavigate(server));
}

function registerImplementNavigate(server: TsServer){
    return vscode.commands.registerCommand('tree.implementNavigate', () => {
        implementMethodAndNavigate(server);
   }); 
}

async function implementMethodAndNavigate(server: TsServer){
    const editor = vscode.window.activeTextEditor;
    
    if (editor && editor.selection.isEmpty) {
        const document = editor.document;
        // the Position object gives you the line and character where the cursor is
        const position = editor.selection.active;
        const sourceMap = await getSourceMap(document);
       
        const genPosClass = sourceMap.generatedPositionFor({
            column: 1,
            line:  getClassNameAndLine(document, position).line + 1,
            source: getNameExceptExtension(document)
        });

        const responseClass = await server.runSymbolLocationsRequest(CommandTypes.Implementation, {
            file: getPathNameExceptExtension(document) + ".ts",
            line: genPosClass.line!,
            offset: genPosClass.column! + 1
        })
        
        
        if (responseClass.body) {
            const newFileName = document.fileName.replace(".tree", ".ts");
            if (responseClass.body.length === 1){ //only .tree.ts exists
                writeFileSync(newFileName, getClass(document, position, getMethod(document, position)), {encoding:'utf-8' });
            } else {

                const methodName = document.getText(document.getWordRangeAtPosition(position));

                const completions = responseClass.body.map(async item=>{
                    const line: string = await nthline(item.end.line, item.file);
                    const offsetForCompletions = item.end.offset + line.substr(item.end.offset).indexOf('{') + 1;
                    return server.runCompletionsRequest({
                        file: item.file,
                        line: item.end.line,
                        offset: offsetForCompletions,
                        prefix: methodName
                    }).then((response)=>{
                        return {
                            response,
                            offset: offsetForCompletions,
                            line: item.end.line,
                            file: item.file
                        }
                    })
                })
                const completionsResponses = await Promise.all(completions);
                completionsResponses.filter(item=>{
                    return item.response.body?.entries.find(entry=>{
                        entry.name == methodName
                    })
                })
                if (completionsResponses.length === 0){
                    // список имплепентящих файлов или навигация
                    return;
                }
        
                const edit = new vscode.WorkspaceEdit();
                const fileAndPosition = completionsResponses.map(item=>{
                    const position = new vscode.Position(item.line, item.offset);
                    edit.insert(vscode.Uri.parse(item.file), new vscode.Position(item.line, item.offset), 
                    EOL + getMethod(document, position) + EOL);
                    return {
                        file: item.file,
                        position
                    };
                });
                await vscode.workspace.applyEdit(edit);
                if (fileAndPosition.length === 1){
                    const openPath = vscode.Uri.parse("file:///" + fileAndPosition[0].file); //A request file path
                    vscode.workspace.openTextDocument(openPath).then(doc => {
                        vscode.window.showTextDocument(doc);
                        vscode.window.activeTextEditor!.selection= new vscode.Selection(fileAndPosition[0].position, fileAndPosition[0].position);
                    });
                } else {
                    const items = fileAndPosition.map(item=> item.file)
                    const fileToOpen = await vscode.window.showQuickPick(items);
                    const openPath = vscode.Uri.parse("file:///" + fileToOpen); //A request file path
                    vscode.workspace.openTextDocument(openPath).then(doc => {
                        vscode.window.showTextDocument(doc);
                        const pos = fileAndPosition.find(item=> item.file === fileToOpen)!.position
                        vscode.window.activeTextEditor!.selection= new vscode.Selection(pos, pos);
                    });
                }
                

            }
        }
      }
}

function getMethod(document: vscode.TextDocument, position: vscode.Position){
    const name = document.getText(document.getWordRangeAtPosition(position));
    const lineFromCharacter = document.lineAt(position.line).text.substr(position.character);
    const arg = !lineFromCharacter.includes('?');
    return `
            ${name}(${arg ? 'arg: unknown' : ''}){
                throw new Error('need to implement method ${name}');
            }
    `
}

function getClassNameAndLine(document: vscode.TextDocument, position : vscode.Position){
    let i = position.line;
    let className= "";
    while (i>= 0){
        if (document.lineAt(i).text.startsWith("$")){
            className = document.lineAt(i).text.match(/.* /)!.toString();
            break;
        }
        i--;
    }
    return {
        className,
        line: i
    }
}

function getClass(document: vscode.TextDocument, position : vscode.Position, ...methods: string[]){
    const className= getClassNameAndLine(document, position).className;

    return `
    namespace $.$$ {
        export class ${className} extends $.${className} {
            ${methods.join(EOL+EOL)}
        }
    }
     `
}