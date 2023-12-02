import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks';
import { simpleGit } from 'simple-git';
import * as fs from "fs"
import { container } from '@sapphire/framework';
import { db } from '../database.js';
import { envParseString } from '@skyra/env-utilities';
import { Octokit } from '@octokit/rest';

// const API_DOCS_CHANNEL = envParseString("API_DOCS_CHANNEL");
const GITHUB_ACCESS_TOKEN = envParseString("GITHUB_ACCESS_TOKEN");

if (!fs.existsSync(".doc_commits")) {
    container.logger.info("Cloning Discord API Docs Repo to .doc_commits");
    await simpleGit().clone("https://github.com/discord/discord-api-docs.git", ".doc_commits");
}

const octokit = new Octokit({
    auth: GITHUB_ACCESS_TOKEN,
});

let running = false;

export class DocCommitsTask extends ScheduledTask {
    public constructor(context: ScheduledTask.LoaderContext, options: ScheduledTask.Options) {
        super(context, { ...options, pattern: "*/5 * * * *" });
    }

    public async run() {
        if (running)
            return;
        running = true;

        const git = simpleGit(".doc_commits");

        await git.pull();

        let latestCommit = await db.docCommits.findFirst().then(res => res?.lastCommitId);
        if (!latestCommit) {
            const log = await git.log({ maxCount: 1 });
            if (!log.latest)
                throw new Error("[DOC_COMMITS] Was not able to find latest doc commit.");

            latestCommit = log.latest.hash;
            container.logger.info(`[DOC_COMMITS] Couldn't find latest commit in Database. Setting to ${latestCommit}`)
            await db.docCommits.create({ data: { lastCommitId: latestCommit } });

            running = false;
            return
        }

        const log = await git.log({
            from: latestCommit,
            to: "HEAD",
        })

        if (!log.total || !log.latest) {
            running = false;
            return;
        }

        container.logger.info(`[DOC_COMMITS] Found ${log.total} new commits.`);


        for (let i = log.total - 1; i >= 0; i--) {
            const commit = log.all[i];
            if (!commit)
                continue;

            container.logger.info(`[DOC_COMMITS] Creating issue for ${commit.hash} (${log.total - i} / ${log.total})`);

            await octokit.rest.issues.create({
                owner: "discordeno",
                repo: "discordeno",
                title: `[api-docs] ${commit.message}`,
                body: [
                    `A new commit was made into the api-docs repo: https://github.com/discord/discord-api-docs/commit/${commit.hash}`,
                    `${commit.body ?? "No details given."}`,
                    "",
                    "This is a bot created issue.",
                ].join("\n"),
                labels: ["api-docs-commits"],
            });

            await db.docCommits.updateMany({ data: { lastCommitId: commit.hash } });

            if (i > 0)
                await new Promise((resolve) => setTimeout(resolve, 10000));
        }

        running = false;
    }
}

declare module '@sapphire/plugin-scheduled-tasks' {
    interface ScheduledTasks {
        manual: never;
    }
}
