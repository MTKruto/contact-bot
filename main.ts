import { Client } from "mtkruto/mod.ts";
import { StorageDenoKV } from "mtkruto/storage/1_storage_deno_kv.ts";
import env from "./env.ts";

const kv = await Deno.openKv();
const client = new Client(new StorageDenoKV(), env.API_ID, env.API_HASH);
await client.start(env.BOT_TOKEN);

const me = await client.getMe();
console.log(`Running as @${me.username}...`);

client.on("deletedMessages", async (ctx) => {
  const messageMap: Record<number, number[]> = {};
  for (const { chatId, messageId } of ctx.deletedMessages) {
    messageMap[chatId] ??= [];
    messageMap[chatId].push(messageId);
  }
  const messages = await Promise.all(Object.entries(messageMap).map(([k, v]) => client.getMessages(k, v)));

  const deleted = new Array<number>();
  for (const message of messages.flat()) {
    if (message.chat.type != "private") {
      continue;
    }
    const { value: ref } = await kv.get<number>(["message_references", message.id]);
    if (!ref) {
      continue;
    }
    deleted.push(ref);
  }
  if (deleted.length == 1) {
    await client.sendMessage(env.CHAT_ID, "This message was deleted.", { replyToMessageId: deleted[0] });
  } else if (deleted.length > 1) {
    const peer = await client.getInputPeer(env.CHAT_ID);
    if (!("channel_id" in peer)) {
      return;
    }
    const channelId = peer.channel_id;
    await client.sendMessage(
      env.CHAT_ID,
      "The following messages were deleted:\n\n" + deleted.map((v) => `https://t.me/c/${channelId}/${v}`).join("\n"),
    );
  }
});

client.on("messageReactions", async (ctx) => {
  if (ctx.messageReactions.chat.id != env.CHAT_ID) {
    return;
  }
  if (!ctx.messageReactions.user) {
    return;
  }
  const { value } = await kv.get<[number, number]>(["incoming_messages", ctx.messageReactions.messageId]);
  if (value == null) {
    return;
  }

  const maybeUser = await kv.get<number>(["reaction_actors", ctx.messageReactions.messageId]);
  if (maybeUser.value == null) {
    await kv.set(["reaction_actors", ctx.messageReactions.messageId], ctx.messageReactions.user.id);
  } else if (maybeUser.value != ctx.messageReactions.user.id) {
    return;
  }

  const [chatId, messageId] = value;
  await client.setReactions(chatId, messageId, ctx.messageReactions.newReactions);
});

client.on("message", async (ctx, next) => {
  if (ctx.chat.type != "private") {
    return next();
  }
  const forwardedMessage = await ctx.forward(env.CHAT_ID);
  await kv.set(["incoming_messages", forwardedMessage.id], [ctx.chat.id, ctx.msg.id]);
  await kv.set(["message_references", ctx.msg.id], forwardedMessage.id);
});

client.on("editedMessage", async (ctx, next) => {
  if (ctx.msg.chat.type != "private") {
    return next();
  }
  const forwardedMessage = await client.forwardMessage(ctx.chat.id, env.CHAT_ID, ctx.msg.id);
  await kv.set(["incoming_messages", forwardedMessage.id], [ctx.chat.id, ctx.msg.id]);
});

client.use(async (ctx, next) => {
  if (ctx.msg?.chat.type == "supergroup" && ctx.msg.chat.id == env.CHAT_ID) {
    await next();
  }
});

client.on("message:text", async (ctx, next) => {
  if (!ctx.msg.replyToMessage) {
    return next();
  }
  const { value } = await kv.get<[number, number]>([
    "incoming_messages",
    ctx.msg.replyToMessage.id,
  ]);
  if (value == null) {
    return;
  }
  const [chatId, messageId] = value;
  const sentMessage = await ctx.client.sendMessage(chatId, ctx.msg.text, { replyToMessageId: messageId });
  await kv.set(["outgoing_messages", ctx.msg.id], [chatId, sentMessage.id]);
});

client.on("editedMessage:text", async (ctx) => {
  if (!ctx.msg.replyToMessage) {
    return;
  }
  const { value } = await kv.get<[number, number]>([
    "outgoing_messages",
    ctx.msg.id,
  ]);
  if (value == null) {
    return;
  }
  const [chatId, messageId] = value;
  await client.editMessageText(chatId, messageId, ctx.msg.text);
});
