import { AsyncResource } from "async_hooks";
import { EventEmitter } from "stream";
import { SHARE_ENV, Worker } from "node:worker_threads";
import { WORKER_FREE_EVENT, WORKER_TASK_INFO } from "../config";

interface IWorkerWithTaskInfo extends Worker {
    [WORKER_TASK_INFO]?: WorkerTaskContext;
}

class WorkerTaskContext extends AsyncResource {
    callback: any;

    constructor(callback: any) {
        super('WorkerTaskContext');
        this.callback = callback;
    }

    done<K = Error | null, T = any>(err: K, result: T) {
        this.runInAsyncScope(this.callback, null, err, result);
        this.emitDestroy();
    }
}

export class WorkerPool extends EventEmitter {
    initialThreads: number;
    workers: Array<IWorkerWithTaskInfo>;
    freeWorkers: Array<IWorkerWithTaskInfo>;
    tasks: Array<any>;

    constructor(initialThreads: number, workerHandlerUrl: string) {
        super();
        this.initialThreads = initialThreads;
        this.workers = [];
        this.freeWorkers = [];
        this.tasks = [];
        // create num worker threads
        for (let index = 0; index < initialThreads; index++) {
            this.registerWorker(workerHandlerUrl);
        }
        // listen to worker free event and check if there are tasks pending
        this.on(WORKER_FREE_EVENT, () => {
            // if there are tasks pending
            if (this.tasks.length > 0) {
                // take the oldest task first
                const { task, callback } = this.tasks.shift()!;
                this.runTask(task, callback);
            }
        });
    }

    /**
     * The function `registerWorker` creates a new worker using a specified script file and sets up
     * event handling for message communication.
     * @param {string} workerHandlerUrl - The `workerHandlerUrl` parameter in the `registerWorker` function is a
     * string that represents the file path of the script that will be executed by the worker. This
     * script file will be used to create a new worker instance that will run the specified script in a
     * separate thread.
     */
    registerWorker(workerHandlerUrl: string) {
        const worker = new Worker(workerHandlerUrl, {
            env: SHARE_ENV,
            execArgv: ["--require", "ts-node/register"]
        }) as IWorkerWithTaskInfo;

        worker.on("message", result => {
            worker[WORKER_TASK_INFO]?.done(null, result);
            worker[WORKER_TASK_INFO] = undefined;
            this.freeWorkers.push(worker);
            this.emit(WORKER_FREE_EVENT);
        });

        // @TODO handle error case
        this.workers.push(worker);
        this.freeWorkers.push(worker);
        this.emit(WORKER_FREE_EVENT);
    }

    /**
     * The `runTask` function in TypeScript checks for available workers, pushes work to pending tasks
     * if no workers are available, and assigns a task to a free worker if one is available.
     * @param {any} task - The `task` parameter in the `runTask` function is typically an object or data
     * that represents the work or task that needs to be executed by a worker. It could be a function to
     * be executed, a set of instructions, or any other data that the worker needs to process.
     * @param {Function} callback - The `callback` parameter in the `runTask` function is a function
     * that will be called once the task is completed by the worker. It is used to handle the result of
     * the task or any other necessary actions that need to be taken after the task is finished.
     * @returns If there are no free workers available, the function `runTask` will push the task and
     * callback to the `tasks` array and then return.
     */
    runTask<T = any>(task: T, callback: Function) {
        // if no workers available push the work to pending tasks
        if (this.freeWorkers.length === 0) {
            this.tasks.push({ task, callback });
            return;
        }
        // take the free worker from pool
        const worker = this.freeWorkers.pop();
        worker![WORKER_TASK_INFO] = new WorkerTaskContext(callback);
        worker?.postMessage(task);
    }

    /* The `close()` method in the `WorkerPool` class is responsible for terminating all the worker
    threads in the pool. It iterates over each worker in the `workers` array and calls the
    `terminate()` method on each worker. This effectively shuts down all the worker threads in the
    pool, cleaning up any resources associated with them and stopping their execution. */
    close() {
        for (const worker of this.workers) worker.terminate();
    }
}
