import "./lib/setup.js";
import { LogLevel, SapphireClient } from "@sapphire/framework";
import { GatewayIntentBits, Partials } from "discord.js";
import { RedisMemoryServer } from "redis-memory-server";

const redisServer = new RedisMemoryServer();


const client = new SapphireClient({
	defaultPrefix: "++",
	caseInsensitiveCommands: true,
	logger: {
		level: LogLevel.Debug,
	},
	shards: "auto",
	intents: [
		GatewayIntentBits.DirectMessageReactions,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.GuildModeration,
		GatewayIntentBits.GuildEmojisAndStickers,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.MessageContent,
	],
	partials: [Partials.Channel],
	loadMessageCommandListeners: true,
	tasks:
	{
		bull:
		{
			connection: {
				host: await redisServer.getHost(),
				port: await redisServer.getPort(),
			}
		}
	}
});

try {
	client.logger.info("Logging in");
	await client.login();
	client.logger.info("logged in");
} catch (error) {
	client.logger.fatal(error);
	client.destroy();
	process.exit(1);
}
