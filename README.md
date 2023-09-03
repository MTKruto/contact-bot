# Contact Bot

## Prerequisites

- [Deno](https://deno.land)

## Setup

1. Create a .env file and specify the required variables `API_ID`, `API_HASH`, `BOT_TOKEN`, and `CHAT_ID`.

## Running

```shell
deno run --allow-env --allow-net --unstable main.ts
```

> Note: The `--unstable` flag is needed for Deno KV. MTKruto does not require it.
