import ipc from "node-ipc";
import tss, { textSpanIntersectsWithTextSpan } from 'typescript/lib/tsserverlibrary';

const SERVER = 'tsserver-connection-plugin';

interface RequestCallback {
	resolve: Function;
	reject: Function;
}

export class TsConnector{
    #seq = 1;
    #callbacks: { [a: number]: RequestCallback } = {}
    constructor(){
        this.startSockets();
    }

    private startSockets(){
        ipc.config.id = 'tree-language-service-plugin';
		ipc.config.retry = 1500;
		ipc.config.silent = true;
		ipc.connectTo(SERVER, () => {
			ipc.of[SERVER].on('functionResponse', (data: any) =>{
                this.#callbacks[data.seq]?.resolve(data);
                delete this.#callbacks[data.seq];
			})
			ipc.of[SERVER].on('callback', (data: any) =>{
                console.log(`${data.name}:`, data.args, data.result);
			})
          });
    }

    public getDefinitions(fileName: string, line: number, offset: number){

        tss.getPositionOfLineAndCharacter(fileName, line, offset)
        return this.runFunction('getDefinitionAtPosition')
    }

    private runFunction<
    FuncName extends Extract<keyof tss.LanguageService, string> ,
    Params extends Parameters<NonNullable<tss.LanguageService[FuncName]>>
    >(funcName: FuncName, params: Params): Promise<ReturnType<NonNullable<tss.LanguageService[FuncName]>>>{
        ipc.of[SERVER].emit('runFunction', {
            seq: this.#seq,
            params: params,
            functionName: funcName
        })
        return new Promise((resolve, reject) => {
			this.#callbacks[this.#seq] = {
				resolve, reject
			}
      }).then((response: any)=> response.result)
    }
}
