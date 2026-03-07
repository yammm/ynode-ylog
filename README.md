# @ynode/ylog

Copyright (c) 2025 Michael Welter <me@mikinho.com>

[![npm version](https://img.shields.io/npm/v/@ynode/ylog.svg)](https://www.npmjs.com/package/@ynode/ylog)
[![license](https://img.shields.io/npm/l/@ynode/ylog.svg)](https://github.com/yammm/ynode-ylog/blob/main/LICENSE)

Helper module for outputting colored info, warn, error, debug and trace/verbose log messages. Works with
[Fastify](https://www.fastify.io/) or standalone Node.js application.

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

## Release Process

This package uses [`@mikinho/autover`](https://github.com/yammm/ynode-autover) for automated versioning and changelog generation. 

To release a new version seamlessly:
1. Make your code changes in a branch.
2. Open a Pull Request against `main`.
3. Add the **`autover-apply`** label to the Pull Request.
4. Merge the Pull Request.

Upon merge, the GitHub Action runner will automatically bump the package version, update the `CHANGELOG.md`, create a Git tag, and commit the release directly to `main`.

> **Note:** Direct commits to `main` are supported but will gracefully skip the `autover` pipeline to prevent versioning collisions.
