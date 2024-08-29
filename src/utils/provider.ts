import { ethers } from "ethers";

export class RpcTrackerProvider extends ethers.JsonRpcProvider {
    url: string | ethers.FetchRequest | undefined
    constructor(url: string | ethers.FetchRequest | undefined) {
        super(url);
        this.url = url;
    }

    getRpcUrl() {
        return this.url;
    }
}