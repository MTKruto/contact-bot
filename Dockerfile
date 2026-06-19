FROM denoland/deno

WORKDIR /app

COPY deno.jsonc deno.lock ./

RUN deno install

COPY main.ts env.ts ./

CMD ["bash", "-c", "deno task start 2>&1 | tee -a logs"]
