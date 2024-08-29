import express, { Request, Response } from 'express';

import { bootstrap } from './src/utils';

import { SHARE_ENV, Worker } from "node:worker_threads"

const app = express();

const PORT = process.env.PORT;
app.get('/', (request: Request, response: Response) => {
  response.status(200).send('Hello World');
});

app
  .listen(PORT, () => {
    console.log('Server running at PORT: ', PORT);
  })
  .on('error', error => {
    // gracefully handle error
    throw new Error(error.message);
  });

bootstrap()
  .then(async () => {
    console.log('connection made');
    try {
      // fire up worker distributor
      new Worker(__dirname + "/src/workers/worker_distributor.ts", {
        env: SHARE_ENV,
        execArgv: ["--require", "ts-node/register"]
      })
    } catch (error) {
      console.log("error while setting up workers", error);
    }

  })
  .catch(error => {
    console.log('Failed to connect to database', error);
  });
