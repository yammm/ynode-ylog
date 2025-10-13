# @ynode/ylog

Copyright (c) 2025 Michael Welter <me@mikinho.com>

[![npm version](https://img.shields.io/npm/v/@ynode/ylog.svg)](https://www.npmjs.com/package/@ynode/ylog)
[![license](https://img.shields.io/npm/l/@ynode/ylog.svg)](https://github.com/yammm/ynode-ylog/blob/main/LICENSE)

Helper module for outputting colored info, warn, error, debug and trace/verbose log messages. Works
with [Fastify](https://www.fastify.io/) or standalone Node.js application.

## Installation

```bash
npm install @ynode/ylog
```

## Basic Usage

```javascript
import ylog from "@ynode/ylog";
const log = ylog(import.meta);

log.info(`[${process.pid}] Hello`);
log.warn(`[${process.pid}] Hello`);
log.error(`[${process.pid}] Hello`);
```

```javascript
const fastify = Fastify({ loggerInstance: log });
fastify.log.info(`Worker ${process.pid} shutting down due to inactivity.`);
```

## License

[MIT](./LICENSE)
