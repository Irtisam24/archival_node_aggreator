import { Contract, ethers } from "ethers";

export interface IChainConfig {
  chainName: string;
  chainHttpRpc: string;
  chainWssRpc: string;
}

interface IFragment {
  type: 'event';
  inputs: Array<any>;
  name: string;
  anonymous: boolean;
}

type TPoolType = "group" | "individual";
type TBlockChain = 'ethereum' | 'bnb' | 'polygon'

export interface ILiquidityEvent {
  fragment: IFragment;
  name: string;
  signature: string;
  topic: string;
  args: Array<string | number | bigint>;
  contractType: TPoolType,
  blockchain: TBlockChain,
  txHash?: string
}

export interface IHourlyArgObj {
  rpc: string,
  groupContract: string,
  individualContract: string
}
export interface IHourlyUpdationWorkerArgs {
  hourlyDataObj: Record<string, IHourlyArgObj>
  isHourlyUpdater: boolean
}

export type TWorkerArgs = ILiquidityEvent[] | IHourlyUpdationWorkerArgs;

export interface IPoolInstance {
  id: number,
  pooladdress: string,
  poolnonce: number,
  token0address: string,
  token1address: string,
  pooltype: TPoolType,
  blockchain: TBlockChain
}

export interface IUniswapTokenHourlyData {
  feesUSD: number,
  id: string,
  periodStartUnix: number,
  priceUSD: number,
  token: {
    decimals: number
  },
  totalValueLocked: number
}


export interface IPoolLiquidityInfo {
  token0Amount: string,
  token1Amount: string,
  currentLiquidity: string
}