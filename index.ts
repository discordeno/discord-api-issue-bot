import { Bot, createBot, Embed, Emoji, getBotIdFromToken, Intents, Message, snowflakeToBigint, startBot } from "discordeno";
import dotenv from "dotenv";
import { Octokit } from "@octokit/rest";

dotenv.config();

const API_DOCS_CHANNEL = process.env.API_DOCS_CHANNEL ? snowflakeToBigint(process.env.API_DOCS_CHANNEL) : 881991954676715653n;
const API_DOCS_BOT_ID = process.env.API_DOCS_BOT_ID ? snowflakeToBigint(process.env.API_DOCS_BOT_ID) : 881992163855065089n;
const ADMIN_ID = process.env.ADMIN_ID ? snowflakeToBigint(process.env.ADMIN_ID) : 615542460151496705n;

const EMOJI_ID = process.env.EMOJI_ID ? snowflakeToBigint(process.env.EMOJI_ID) : 855138172756295760n;
const EMOJI_STRING = process.env.EMOJI_STRING ?? "<a:verified_blue:855138172756295760>";

const TITLE_PREFIX = process.env.TITLE_PREFIX || "[discord-api-docs:main]";

const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
if (!GITHUB_ACCESS_TOKEN) {
    throw new Error("No GitHub access token provided");
}

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    throw new Error("No token provided");
}

const applicationId = getBotIdFromToken(TOKEN);

const bot = createBot({
    token: TOKEN,
    applicationId,
    intents: Intents.Guilds | Intents.GuildMessages | Intents.MessageContent | Intents.GuildMessageReactions,
    events: {
        messageCreate,
        reactionAdd,
        ready: () => {
            console.log("Ready");
        },
    },
});

const octokit = new Octokit({
    auth: GITHUB_ACCESS_TOKEN,
});

async function reactionAdd(
    bot: Bot,
    payload: {
        userId: bigint;
        channelId: bigint;
        messageId: bigint;
        emoji: Emoji;
    }
) {
    if (payload.channelId !== API_DOCS_CHANNEL || payload.userId !== ADMIN_ID) return;
    if (payload.emoji.id !== EMOJI_ID) return;

    await bot.helpers.deleteReactionsEmoji(payload.channelId, payload.messageId, EMOJI_STRING);
}

async function messageCreate(bot: Bot, message: Message) {
    if (message.authorId !== API_DOCS_BOT_ID && message.authorId !== ADMIN_ID) return;

    if (message.content === "++ping") {
        await bot.helpers.sendMessage(message.channelId, {
            content: "Pong!",
        });

        return;
    }

    if (message.content.startsWith("++fakeit")) {
        const [, rawId] = message.content.split(" ");
        if (!rawId) {
            return await bot.helpers.sendMessage(message.channelId, {
                content: "No message id provided",
            });
        }

        const id = snowflakeToBigint(rawId);
        const docsMessage = await bot.helpers.getMessage(API_DOCS_CHANNEL, id).catch(() => undefined);
        if (!docsMessage) {
            return await bot.helpers.sendMessage(message.channelId, {
                content: "No message found",
            });
        }

        message = docsMessage;
    }

    if (message.channelId !== API_DOCS_CHANNEL) return;

    const embed = message.embeds[0];
    if (!embed) return;

    if (!embed.title?.startsWith(TITLE_PREFIX)) return;

    await createIssues(message.id, embed);

    await bot.helpers.addReaction(message.channelId, message.id, EMOJI_STRING);
}

async function createIssues(messageId: bigint, embed: Embed) {
    const url = embed.url;
    if (!url) {
        await bot.helpers.sendMessage(messageId, {
            content: `<@${ADMIN_ID}> Could not get the issue link.`,
            messageReference: { messageId, failIfNotExists: false },
        });
        return;
    }

    const hashPart = url.split("/").pop();
    if (!hashPart) {
        await bot.helpers.sendMessage(messageId, {
            content: `<@${ADMIN_ID}> Could not get the hash from the issue link.`,
            messageReference: { messageId, failIfNotExists: false },
        });
        return;
    }

    let commits;

    // Its a compare URL
    if (hashPart.includes("...")) {
        const compare = await octokit.rest.repos.compareCommitsWithBasehead({
            owner: "discord",
            repo: "discord-api-docs",
            basehead: hashPart,
        });

        commits = compare.data.commits.map((cmp) => cmp.commit);
    } else {
        const commit = await octokit.rest.repos.getCommit({
            owner: "discord",
            repo: "discord-api-docs",
            ref: hashPart,
        });

        commits = [commit.data.commit];
    }

    for (let i = 0; i < commits.length; ++i) {
        const commit = commits[i];

        const url = commit.url.replace(
            "https://api.github.com/repos/discord/discord-api-docs/git/commits/",
            "https://github.com/discord/discord-api-docs/commit/"
        );

        const messageParts = commit.message.split("\n");
        const title = messageParts.shift();
        const description = messageParts.length !== 0 ? messageParts.join("\n") : undefined;

        await octokit.rest.issues.create({
            owner: "discordeno",
            repo: "discordeno",
            title: `[api-docs] ${title}`,
            body: [
                `A new commit was made into the api-docs repo: ${url}`,
                `${description ?? "No details given."}`,
                "",
                "This is a bot created issue.",
            ].join("\n"),
            labels: ["api-docs-commits"],
        });

        if (i !== commits.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}

await startBot(bot);
