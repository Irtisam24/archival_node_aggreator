import { PoolClient } from 'pg';
import { UNISWAP_V3_GRAPH_URL, getClient } from '../config';
import axios from 'axios';
import { getTokenHourlyDetailsQuery } from './uniswap_queries';

export const bootstrap = async () => {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        // Create enums if they don't exist
        await createEnums(client);
        // Create tables if they don't exist
        await createTables(client);
        await createIndexes(client);
        await client.query('COMMIT');
    } catch (error) {
        console.log('error', error);
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const sleep = async (ms: number): Promise<void> => {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
};

// Function to create enums if they don't exist
const createEnums = async (client: PoolClient) => {
    await client.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='pool_type_enum') THEN
                CREATE TYPE pool_type_enum AS ENUM ('group', 'individual');
            END IF;

            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='block_chain_type_enum') THEN
                CREATE TYPE block_chain_type_enum AS ENUM ('ethereum', 'bnb', 'polygon');
            END IF;

            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='transaction_type_enum') THEN
                CREATE TYPE transaction_type_enum AS ENUM ('mint','liquidity_added', 'remove', 'claim');
            END IF;
        END
        $$;
    `);
};

// Function to create tables if they don't exist
const createTables = async (client: PoolClient) => {
    await client.query(`
        CREATE TABLE IF NOT EXISTS pools_to_monitor (
            id SERIAL PRIMARY KEY,
            poolAddress TEXT NOT NULL,
            poolNonce INTEGER NOT NULL,
            token0Address TEXT NOT NULL,
            token1Address TEXT NOT NULL,
            poolType pool_type_enum NOT NULL,
            blockChain block_chain_type_enum NOT NULL,
            UNIQUE (poolAddress,poolNonce,poolType,blockChain)
        );

        CREATE TABLE IF NOT EXISTS transaction_logs (
            id SERIAL PRIMARY KEY,
            poolId bigint REFERENCES pools_to_monitor NOT NULL,
            userAddress TEXT NOT NULL, 
            token0Amount TEXT,
            token0AmountUSD TEXT,
            token1Amount TEXT,
            token1AmountUSD TEXT,
            txHash text NOT NULL,
            poolType pool_type_enum,
            blockChain block_chain_type_enum,
            transactionType transaction_type_enum,
            liquidityAmount NUMERIC,
            liquidityAmountUSD NUMERIC,
            createdAt TIMESTAMP DEFAULT NOW(),
            UNIQUE (poolType,blockChain,transactionType,txHash)
        );

        CREATE TABLE IF NOT EXISTS pool_hourly_data_internal (
            id SERIAL PRIMARY KEY,
            poolId bigint REFERENCES pools_to_monitor,
            token0AmountCumulative NUMERIC,
            token0AmountCumulativeUsd NUMERIC,
            token1AmountCumulative NUMERIC,
            token1AmountCumulativeUsd NUMERIC,
            totalValueLocked NUMERIC,
            liquidityAtTime NUMERIC,
            liquidityAtTimeUsd NUMERIC,
            roiAtTime NUMERIC,
            mddAtTime NUMERIC,
            createdAt TIMESTAMP DEFAULT NOW()
        );
    `);
};

const createIndexes = async (client: PoolClient) => {
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pool_details
    ON pools_to_monitor (pooladdress, poolnonce, pooltype, blockchain);`)
}

export async function getTokenDetails<T>(tokenAddress: string): Promise<T> {
    const resp = await axios.post(UNISWAP_V3_GRAPH_URL, {
        query: getTokenHourlyDetailsQuery(tokenAddress),
    });
    return resp.data?.data?.tokenHourDatas[0];
}
