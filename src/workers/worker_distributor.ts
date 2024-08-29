import { Contract } from "ethers";
import { CHAIN_CONFIGS, CONTRACTS_START_BLOCKS, GROUP_CONTRACTS } from "../config";
import { IChainConfig, IHourlyArgObj } from "../types";
import { WorkerPool } from "./worker_pool";

import groupAbi from "../abi/group_contract.json";
import individualAbi from "../abi/indv_contract.json";
import { sleep } from "../utils";
import { RpcTrackerProvider } from "../utils/provider";

class WorkDistributor {
    workerPool: WorkerPool;
    providers: Map<string, RpcTrackerProvider>;
    groupContractInstances: Map<string, Contract>;
    individualContractInstances: Map<string, Contract>;
    chainsReadBlocks: Map<string, number>;
    transactionBlockLookAhead: number;

    constructor(workerPool: WorkerPool, transactionBlockLookAhead = 128, chainConfigs?: Array<IChainConfig>) {
        this.workerPool = workerPool;
        this.providers = new Map();
        this.groupContractInstances = new Map();
        this.individualContractInstances = new Map();
        this.chainsReadBlocks = new Map();
        this.transactionBlockLookAhead = transactionBlockLookAhead;
        const chainConfigsFinal = chainConfigs ? chainConfigs : CHAIN_CONFIGS;

        for (const [index, config] of chainConfigsFinal.entries()) {
            this.#registerNetworks(index, config);
        }
    }

    #registerNetworks(index: number, chainConfig: IChainConfig) {
        const provider = new RpcTrackerProvider(chainConfig.chainHttpRpc);
        const contractGroup = new Contract(GROUP_CONTRACTS[index], groupAbi, provider);
        const contractIndividual = new Contract(GROUP_CONTRACTS[index], individualAbi, provider);
        this.providers.set(chainConfig.chainName, provider);
        this.groupContractInstances.set(chainConfig.chainName, contractGroup);
        this.individualContractInstances.set(chainConfig.chainName, contractIndividual);
        this.chainsReadBlocks.set(chainConfig.chainName, Number(CONTRACTS_START_BLOCKS[index]));
    }

    #replacer(_: any, value: { toString: () => any; }) {
        return typeof value === 'bigint' ? value.toString() : value;
    }

    async startListening(): Promise<never> {
        // fire up hourly updating worker
        const hourlyWorkerData: Record<string, IHourlyArgObj> = {};
        for (const [key, provider] of this.providers) {
            hourlyWorkerData[key] = {
                groupContract: await this.groupContractInstances.get(key)!.getAddress(),
                individualContract: await this.individualContractInstances.get(key)!.getAddress(),
                rpc: provider.getRpcUrl() as string
            }

        }
        this.workerPool.runTask(JSON.stringify({
            hourlyDataObj: hourlyWorkerData,
            isHourlyUpdater: true
        }), (_err: any, result: any) => {
            console.log("got response back", result);
        });
        while (true) {
            await sleep(5000);
        }
        // while (true) {
        //     // @TODO handle undefined risks and other errors properly
        //     for (const [key, provider] of this.providers.entries()) {
        //         const latestBlockNumber = await provider.getBlockNumber();
        //         const fromBlock = this.chainsReadBlocks.get(key);
        //         if (!fromBlock) {
        //             throw new Error("Incorrect chains configuration");
        //         }
        //         if (fromBlock === latestBlockNumber) {
        //             console.log("already on latest");
        //             continue;
        //         }
        //         const toBlock = fromBlock + this.transactionBlockLookAhead > latestBlockNumber
        //             ? latestBlockNumber : fromBlock + this.transactionBlockLookAhead;
        //         // check for each events
        //         const groupLogs = await provider.getLogs({
        //             address: this.groupContractInstances.get(key),
        //             fromBlock: fromBlock,
        //             toBlock: toBlock
        //         });
        //         const groupParsedLogs = groupLogs.map((log) => {
        //             return {
        //                 ...this.groupContractInstances.get(key)!.interface.parseLog(log),
        //                 txHash: log.transactionHash,
        //                 contractType: "group",
        //                 blockchain: key
        //             };
        //         });
        //         this.workerPool.runTask(JSON.stringify(groupParsedLogs, this.#replacer), (_err: any, result: any) => {
        //             console.log("got response back", result);
        //         });
        //         console.log("after adding to worker");
        //         this.chainsReadBlocks.set(key, toBlock);
        //     }
        //     await sleep(5000);
        // }
    }
}

const workerPool = new WorkerPool(3, __dirname + "/worker_handler.ts");
const workerDistributor = new WorkDistributor(workerPool);
workerDistributor.startListening();