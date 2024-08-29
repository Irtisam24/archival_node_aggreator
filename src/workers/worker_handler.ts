import { parentPort } from 'node:worker_threads';
import { getTokenDetails, sleep } from '../utils';
import { IHourlyUpdationWorkerArgs, ILiquidityEvent, IPoolInstance, IPoolLiquidityInfo, IUniswapTokenHourlyData, TWorkerArgs } from '../types';
import { getClient } from '../config';
import BigNumber from 'bignumber.js';
import { PoolClient } from 'pg';
import { isHourlyUpdationWorkerArgs } from '../utils/type_guards';
import { Contract, ethers } from 'ethers';
import groupAbi from "../abi/group_contract.json";
import individualAbi from "../abi/indv_contract.json";
import { RpcTrackerProvider } from '../utils/provider';


parentPort?.on('message', async (task: string) => {
    const parsedEvent: TWorkerArgs = JSON.parse(task);
    if (isHourlyUpdationWorkerArgs(parsedEvent)) {
        console.log("is hourly task");
        startHourlyWorker(parsedEvent);
        return;
    }
    for (const event of parsedEvent) {
        switch (event.name) {
            case "LiquidityAdded":
                await handleLiquidityManageEvent(event);
                break;
            case "LiquidityRemoved":
                await handleLiquidityManageEvent(event)
                break;
            case "FeeClaimed":
                await handleFeeClaimedEvent(event);
                break;
            case "PoolAdded":
                await handlePoolAdditionEvent(event);
                break;
            case "PoolRemoved":
                console.log("PoolRemoved");
                break;
            default:
                console.log("invalid event");
                break;
        }
    }
    parentPort?.postMessage("task completed");
});

/**
 * The function `handlePoolAdditionEvent` inserts data into a database table while handling
 * transactional operations.
 * @param {ILiquidityEvent} event - The `handlePoolAdditionEvent` function takes an `ILiquidityEvent`
 * object as a parameter. This object likely contains information related to a liquidity pool addition
 * event, such as pool address, pool nonce, token addresses, pool type, and blockchain information.
 */
const handlePoolAdditionEvent = async (event: ILiquidityEvent) => {
    const client = await getClient()
    try {
        await client.query("BEGIN");
        await client.query("SELECT * FROM pools_to_monitor;")
        const query = `INSERT INTO pools_to_monitor(poolAddress,poolNonce,token0Address,token1Address,poolType,blockchain) VALUES($1,$2,$3,$4,$5,$6)`
        const values = [event.args[0], event.args[1], event.args[2], event.args[3], event.contractType, event.blockchain];
        await client.query(query, values);
        await client.query("COMMIT");
    } catch (error) {
        console.log("error when adding new pool", error);
        await client.query("ROLLBACK");
    } finally {
        client.release();
    }
}

/**
 * The function `handleFeeClaimedEvent` processes a fee claimed event by mapping event arguments,
 * retrieving pool and token details, calculating token amounts in USD, and inserting transaction logs
 * into a database.
 * @param {ILiquidityEvent} event - ILiquidityEvent - an interface representing a liquidity event
 */
const handleFeeClaimedEvent = async (event: ILiquidityEvent) => {

    const client = await getClient();

    try {
        const mappedArgs = mapArgsToFeeClaimEvent(event.args as Array<string>);
        await client.query("BEGIN");

        const poolData = await getUniqueLocalPoolDetails(client, [mappedArgs.poolAddress, mappedArgs.poolNonce, event.contractType, event.blockchain]);

        if (poolData.rowCount == 0) {
            throw new Error("Pool not added to monitor list");
        }

        const poolData_ = poolData.rows[0];
        const token0Details = await getTokenDetails<IUniswapTokenHourlyData>(poolData_.token0address.toLowerCase());
        const token1Details = await getTokenDetails<IUniswapTokenHourlyData>(poolData_.token1address.toLowerCase());

        const token0AmountUsd = mappedArgs.token0Amount.dividedBy(10 ** token0Details.token.decimals)
            .multipliedBy(new BigNumber(String(token0Details.priceUSD))).toString();
        const token1AmountUsd = mappedArgs.token1Amount.dividedBy(10 ** token1Details.token.decimals)
            .multipliedBy(new BigNumber(String(token0Details.priceUSD))).toString();

        const insertQuery = `INSERT INTO transaction_logs (
                poolId,
                userAddress, 
                token0Amount, 
                token0AmountUSD, 
                token1Amount, 
                token1AmountUSD, 
                txHash, 
                poolType, 
                blockChain, 
                transactionType
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            )`
        const insertValues = [
            poolData_.id,
            mappedArgs.depositor,
            mappedArgs.token0Amount.toString(),
            token0AmountUsd,
            mappedArgs.token1Amount.toString(),
            token1AmountUsd,
            event.txHash,
            event.contractType,
            event.blockchain,
            mappedArgs.eventType
        ];

        await client.query(insertQuery, insertValues);
        await client.query("COMMIT");

    } catch (error) {
        console.log("error in fee claim event", error);
        await client.query("ROLLBACK")
    } finally {
        client.release();
    }
}

/**
 * The function `handleLiquidityManageEvent` processes liquidity management events by retrieving pool
 * and token details, calculating USD values, and inserting transaction logs into a database.
 * @param {ILiquidityEvent} event - ILiquidityEvent {
 */
const handleLiquidityManageEvent = async (event: ILiquidityEvent) => {
    const client = await getClient();
    try {
        const mappedArgs = mapArgsToLiquidityManageEvent(event.args as Array<string>, event.name === "LiquidityRemoved");
        await client.query("BEGIN");
        const poolData = await getUniqueLocalPoolDetails(client, [mappedArgs.poolAddress, mappedArgs.poolNonce, event.contractType, event.blockchain]);

        if (poolData.rowCount == 0) {
            throw new Error("Pool not added to monitor list");
        }

        const poolData_ = poolData.rows[0];
        const token0Details = await getTokenDetails<IUniswapTokenHourlyData>(poolData_.token0address.toLowerCase());
        const token1Details = await getTokenDetails<IUniswapTokenHourlyData>(poolData_.token1address.toLowerCase());

        const token0AmountUsd = mappedArgs.token0Amount.dividedBy(10 ** token0Details.token.decimals)
            .multipliedBy(new BigNumber(String(token0Details.priceUSD))).toString();
        const token1AmountUsd = mappedArgs.token1Amount.dividedBy(10 ** token1Details.token.decimals)
            .multipliedBy(new BigNumber(String(token0Details.priceUSD))).toString();
        const liquidityAddedInUsd = new BigNumber(token0AmountUsd).plus(new BigNumber(token1AmountUsd)).toString();

        const insertQuery = `INSERT INTO transaction_logs (
            poolId,
            userAddress, 
            token0Amount, 
            token0AmountUSD, 
            token1Amount, 
            token1AmountUSD, 
            txHash, 
            poolType, 
            blockChain, 
            transactionType, 
            liquidityAmount, 
            liquidityAmountUSD
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )`

        const insertValues = [
            poolData_.id,
            mappedArgs.depositor,
            mappedArgs.token0Amount.toString(),
            token0AmountUsd,
            mappedArgs.token1Amount.toString(),
            token1AmountUsd,
            event.txHash,
            event.contractType,
            event.blockchain,
            mappedArgs.eventType,
            mappedArgs.liquidityAmount.toString(),
            liquidityAddedInUsd
        ];
        await client.query(insertQuery, insertValues);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        console.log("error in handling liquidityAddition", error);
    } finally {
        client.release();
    }
}

/**
 * The function `mapArgsToLiquidityManageEvent` maps an array of string arguments to an object
 * representing liquidity management event details.
 * @param args - An array of strings containing the following elements:
 * @param {boolean} [isRemoveEvent] - The `isRemoveEvent` parameter is a boolean flag that indicates
 * whether the event is a removal event. If `isRemoveEvent` is `true`, it means the event is a removal
 * event. If `isRemoveEvent` is `false` or not provided, it means the event is not
 * @returns The function `mapArgsToLiquidityManageEvent` takes an array of strings as input arguments
 * and an optional boolean flag `isRemoveEvent`. It then maps these arguments to an object with the
 * following properties:
 */
const mapArgsToLiquidityManageEvent = (args: Array<string>, isRemoveEvent?: boolean) => {
    return {
        poolAddress: args[0],
        poolNonce: Number(args[1]),
        depositor: args[2],
        token0Amount: new BigNumber(args[3]),
        token1Amount: new BigNumber(args[4]),
        liquidityAmount: new BigNumber(args[5]),
        eventType: isRemoveEvent ? "remove" : parseInt(args[6]) == 0 ? 'mint' : 'liquidity_added'
    };
}

/**
 * The function `mapArgsToFeeClaimEvent` takes an array of strings as input and maps the elements to
 * specific properties of a fee claim event object.
 * @param args - Based on the provided `mapArgsToFeeClaimEvent` function, the parameters in the `args`
 * array are as follows:
 * @returns An object is being returned with the following properties:
 * - poolAddress: the first element of the input array args
 * - poolNonce: the second element of the input array args converted to a Number
 * - depositor: the third element of the input array args
 * - token0Amount: a new instance of BigNumber created with the fourth element of the input array args
 * - token1Amount: a
 */
const mapArgsToFeeClaimEvent = (args: Array<string>) => {
    return {
        poolAddress: args[0],
        poolNonce: Number(args[1]),
        depositor: args[2],
        token0Amount: new BigNumber(args[3]),
        token1Amount: new BigNumber(args[4]),
        eventType: "claim"
    }
}

/**
 * The function `getUniqueLocalPoolDetails` retrieves unique pool details based on specific criteria
 * from a database using TypeScript and async/await syntax.
 * @param {PoolClient} client - The `client` parameter in your function `getUniqueLocalPoolDetails` is
 * likely an instance of a database connection pool client. It is used to interact with the database to
 * execute queries and retrieve data.
 * @param args - The `args` parameter in the `getUniqueLocalPoolDetails` function is an array
 * containing values that will be used as parameters in the SQL query. The values in the `args` array
 * correspond to the placeholders in the SQL query (``, ``, ``, ``).
 * @returns The function `getUniqueLocalPoolDetails` is returning the result of the query executed
 * using the provided `client` and `args`. The query selects `id`, `token0address`, and `token1address`
 * from the `pools_to_monitor` table based on the conditions specified in the `WHERE` clause. The
 * result of the query, which is the pool data matching the specified conditions
 */
const getUniqueLocalPoolDetails = async (client: PoolClient, args: Array<string | number>) => {
    const poolDataQuery = `
    SELECT id,token0address,token1address 
    FROM pools_to_monitor 
    WHERE LOWER(pooladdress) = LOWER($1) 
        AND poolnonce = $2 
        AND pooltype = $3 
        AND blockchain = $4
`;
    const poolData = await client.query<IPoolInstance>(poolDataQuery,
        args
    )
    return poolData;
}

const startHourlyWorker = async (args: IHourlyUpdationWorkerArgs) => {

    const providers = new Map();
    const groupContracts = new Map();
    const individualContracts = new Map();
    const memo = new Map();
    for (const [key, value] of Object.entries(args.hourlyDataObj)) {
        const provider = new RpcTrackerProvider(value.rpc)
        providers.set(key, provider)
        groupContracts.set(key, new Contract(value.groupContract, groupAbi, provider))
        individualContracts.set(key, new Contract(value.individualContract, individualAbi, provider))
    }

    while (true) {
        try {
            const allPoolsToMonitor = await getAllPoolsToMonitor();
            if (allPoolsToMonitor && allPoolsToMonitor.length !== 0) {
                for (const pool of allPoolsToMonitor) {
                    let poolTotalCurrentLiquidity: IPoolLiquidityInfo;
                    if (pool.pooltype == "group") {
                        // if group pool get from group contract
                        poolTotalCurrentLiquidity = await getPoolDetailsFromChain(
                            groupContracts.get(pool.blockchain),
                            pool.pooladdress,
                            pool.poolnonce
                        )
                    } else {
                        //get from individual contract
                        poolTotalCurrentLiquidity = await getPoolDetailsFromChain(
                            individualContracts.get(pool.blockchain),
                            pool.pooladdress,
                            pool.poolnonce
                        )
                    }
                    console.log("poolTotalCurrentLiquidity", poolTotalCurrentLiquidity);

                    let token0Details: IUniswapTokenHourlyData
                    let token1Details: IUniswapTokenHourlyData
                    const memoKeyToken0 = `${pool.blockchain}_${pool.token0address}`
                    const memoKeyToken1 = `${pool.blockchain}_${pool.token1address}`
                    if (memo.get(memoKeyToken0)) {
                        token0Details = memo.get(memoKeyToken0);
                    } else {
                        const tokenDetails = await getTokenDetails<IUniswapTokenHourlyData>(pool.token0address.toLowerCase());
                        memo.set(memoKeyToken0, tokenDetails);
                        token0Details = tokenDetails;
                    }
                    if (memo.get(memoKeyToken1)) {
                        token1Details = memo.get(memoKeyToken1);
                    } else {
                        const tokenDetails = await getTokenDetails<IUniswapTokenHourlyData>(pool.token1address.toLowerCase());
                        memo.set(memoKeyToken1, tokenDetails);
                        token1Details = tokenDetails;
                    }
                    const token0AmountUsd = new BigNumber(poolTotalCurrentLiquidity.token0Amount).dividedBy(10 ** token0Details.token.decimals)
                        .multipliedBy(new BigNumber(String(token0Details.priceUSD))).toString();
                    const token1AmountUsd = new BigNumber(poolTotalCurrentLiquidity.token0Amount).dividedBy(10 ** token1Details.token.decimals)
                        .multipliedBy(new BigNumber(String(token0Details.priceUSD))).toString();

                    const liquidityAddedInUsd = new BigNumber(token0AmountUsd).plus(new BigNumber(token1AmountUsd)).toString();
                }
            }
        } catch (error) {
            console.log("error in hourly updation worker", error);
        } finally {
            memo.clear();
            // sleep for one hour
            await sleep(3600)
        }

    }
}

const getPoolDetailsFromChain = async (contract: Contract, poolAddress: string, poolNonce: number): Promise<IPoolLiquidityInfo> => {
    const [amount0, amount1, _, _poolLiquidity] = await contract.getPoolDetails(poolAddress, poolNonce);
    return {
        token0Amount: amount0.toString(),
        token1Amount: amount1.toString(),
        currentLiquidity: _poolLiquidity[1].toString()
    }
}


const getAllPoolsToMonitor = async () => {
    const client = await getClient();
    try {
        const poolsToMonitor = await client.query<IPoolInstance>("SELECT * FROM pools_to_monitor;")
        if (poolsToMonitor.rowCount === 0) {
            throw new Error("No pools to monitor");
        }
        return poolsToMonitor.rows;
    } catch (error) {
        console.log("error when getting all pools to monitor", error);
    } finally {
        client.release();
    }
}

const calculateRoiAtTime = async () => { }
const calculateMDDAtTime = async () => { }