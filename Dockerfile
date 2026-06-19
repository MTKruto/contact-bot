FROM denoland/deno

WORKDIR /app

COPY deno.jsonc deno.lock ./

RUN deno install

CMD ["bash", "-c", "deno task start 2>&1 | tee -a logs"]
