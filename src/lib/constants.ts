import { join } from "path";
import * as url from 'url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export const rootDir = join(__dirname, "..", "..");
export const srcDir = join(rootDir, "src");

export const RandomLoadingMessage = [
	"Computing...",
	"Thinking...",
	"Cooking some food",
	"Give me a moment",
	"Loading...",
];
