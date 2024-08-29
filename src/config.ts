import { Pool } from 'pg';
import { IChainConfig } from './types';
import dotenv from 'dotenv';

dotenv.config();


export const WORKER_FREE_EVENT = Symbol("worker_free_event");
export const WORKER_TASK_INFO = Symbol("worker_task_info");

export const UNISWAP_V3_GRAPH_URL = String(process.env.UNISWAP_V3_GRAPH_URL);

export const CHAIN_CONFIGS: IChainConfig[] = [
    {
        chainName: 'ethereum',
        chainHttpRpc: 'https://rpc.buildbear.io/increased-greengoblin-9345c7c8',
        chainWssRpc: 'wss://todo',
    },
];

export const GROUP_CONTRACTS = process.env.CONTRACTS_GROUP?.trim()
    ? process.env.CONTRACTS_GROUP.trim().split(',')
    : [];

export const INDIVIDUAL_CONTRACTS = process.env.CONTRACTS_INDIVIDUAL?.trim()
    ? process.env.CONTRACTS_INDIVIDUAL.trim().split(',')
    : [];

export const CONTRACTS_START_BLOCKS = process.env.CONTRACTS_START_BLOCKS?.trim()
    ? process.env.CONTRACTS_START_BLOCKS.trim().split(',')
    : [];

export const POOL = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT?.trim()),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
});

export const query = async (text: string, params: Array<string>) => {
    const start = Date.now();
    const res = await POOL.query(text, params);
    const duration = Date.now() - start;
    console.log('executed query', { text, duration, rows: res.rowCount });
    return res;
};

export const getClient = async () => {
    return await POOL.connect();
};
