import { Client } from "mtkruto/mod.ts";
import { StorageDenoKV } from "mtkruto/storage/1_storage_deno_kv.ts";
import env from "./env.ts";

const kv = await Deno.openKv();
const client = new Client(new StorageDenoKV(), env.API_ID, env.API_HASH, { initialDc: "1" }); // the initialDc parameters makes sure that we connect to prod servers

client.on("connectionState", async ({ connectionState }) => { // this is called when the client’s connection state is changed, and should be applied before starting the client
  if (connectionState == "not-connected") {
    await new Promise((r) => setTimeout(r, 5000)); // try reconnecting after 5 seconds
    await client.start();
  } else if (connectionState == "ready") {
    const me = await client.getMe();
    console.log(`Running as @${me.username}...`);
  }
});

await client.start(env.BOT_TOKEN);

client.use(async (update, next) => {
  const msg = update.editedMessage ?? update.message;
  if (msg?.out === false) { // only handle incoming messages, outgoing ones are not interesting
    await next();
  }
});

client.on("message", async ({ message }, next) => {
  if (message.chat.type != "private") {
    return next();
  }
  const forwardedMessage = await client.forwardMessage(message.chat.id, env.CHAT_ID, message.id);
  await kv.set(["incoming_messages", forwardedMessage.id], [message.chat.id, message.id]);
  await kv.set(["message_references", message.id], forwardedMessage.id);
});

client.on("deletedMessages", async ({ deletedMessages }) => {
  for (const message of deletedMessages) {
    if (message.chat.type != "private") {
      continue;
    }
    const { value: ref } = await kv.get<number>(["message_references", message.id]);
    if (!ref) {
      continue;
    }
    await client.sendMessage(env.CHAT_ID, "This message was deleted.", { replyToMessageId: ref });
  }
});

client.on("editedMessage", async ({ editedMessage }, next) => {
  if (editedMessage.chat.type != "private") {
    return next();
  }
  const forwardedMessage = await client.forwardMessage(editedMessage.chat.id, env.CHAT_ID, editedMessage.id);
  await kv.set(["incoming_messages", forwardedMessage.id], [editedMessage.chat.id, editedMessage.id]);
});

client.use(async (update, next) => {
  const msg = update.editedMessage ?? update.message;
  if (msg?.chat.type == "supergroup" && msg.chat.id == env.CHAT_ID) {
    await next();
  }
});

client.on(["message", "text", "replyToMessage"], async ({ message }) => {
  const { value } = await kv.get<[number, number]>([
    "incoming_messages",
    message.replyToMessage.id,
  ]);
  if (value == null) {
    return;
  }
  const [chatId, messageId] = value;
  const sentMessage = await client.sendMessage(chatId, message.text, { replyToMessageId: messageId });
  await kv.set(["outgoing_messages", message.id], [chatId, sentMessage.id]);
});

client.on(["editedMessage", "text", "replyToMessage"], async ({ editedMessage }) => {
  const { value } = await kv.get<[number, number]>([
    "outgoing_messages",
    editedMessage.id,
  ]);
  if (value == null) {
    return;
  }
  const [chatId, messageId] = value;
  await client.editMessageText(chatId, messageId, editedMessage.text);
});
