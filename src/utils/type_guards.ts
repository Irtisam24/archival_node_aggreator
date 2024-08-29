import { IHourlyUpdationWorkerArgs } from "../types";

export const isHourlyUpdationWorkerArgs = (arg: any): arg is IHourlyUpdationWorkerArgs => {
    return arg && typeof arg === 'object' && !arg.length && 'isHourlyUpdater' in arg;
}