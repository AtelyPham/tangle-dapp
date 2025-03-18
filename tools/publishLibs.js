// @ts-check

import core from '@actions/core';
import { request } from '@octokit/request';
import { readFileSync } from 'fs';
import { releasePublish } from 'nx/release/index.js';
import { resolve } from 'path';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

function gatherReleaseInfo(logPath, version) {
  const changeLogs = readFileSync(logPath, 'utf8');
  const regex = /## ([0-9]+(\.[0-9]+)+)\s\([0-9]{4}-[0-9]{2}-[0-9]{2}\)/i;

  let lines = changeLogs.split(/\n/);
  let foundChangelog = false;
  let releaseInfo = '';
  let i = 0;

  for (let j = 0; j < lines.length; j++) {
    if (lines[j].includes(`${version}`)) {
      i = j;
      j = lines.length;
      foundChangelog = true;
    }
  }

  lines = lines.slice(i);

  if (foundChangelog) {
    for (let j = 0; j < lines.length; j++) {
      if (j == 0) {
        releaseInfo += `${lines[j]}` + '\n';
        continue;
      }

      if (!regex.test(lines[j])) {
        releaseInfo += `${lines[j]}` + '\n';
      } else {
        j = lines.length;
      }
    }
  }

  if (releaseInfo === '') {
    core.setFailed(
      'No release info found, either missing in changelog or changelog is formatted incorrectly',
    );
  }

  console.log('Gathered release info...');
  return releaseInfo;
}

async function publishToGithub(releaseInfo, version, project) {
  await request('POST /repos/{owner}/{repo}/releases', {
    headers: {
      authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
    owner: 'tangle-network',
    name: `[${version}] ${project}`,
    repo: 'dapp',
    tag_name: `${project}/${version}`,
    body: releaseInfo,
  }).catch((err) => {
    core.setFailed(err);
  });

  console.log(`Published to Github: ${project}/${version}`);
}

(async () => {
  const options = await yargs(hideBin(process.argv))
    .option('dryRun', {
      alias: 'd',
      description:
        'Whether or not to perform a dry-run of the release process, defaults to true',
      type: 'boolean',
      default: false,
    })
    .option('verbose', {
      alias: 'v',
      description:
        'Whether or not to enable verbose logging, defaults to false',
      type: 'boolean',
      default: false,
    })
    .option('projects', {
      description: 'Projects to publish',
      type: 'string',
      array: true,
      demandOption: true,
    })
    .option('firstRelease', {
      alias: 'first-release',
      description:
        'Whether or not to perform a first release, defaults to false',
      type: 'boolean',
      default: false,
    })
    .parseAsync();

  for (const project of options.projects) {
    const logPath = resolve(`./libs/${project}/CHANGELOG.md`);

    // Read the version from the package.json
    const packageJson = readFileSync(
      resolve(`./dist/libs/${project}/package.json`),
      'utf8',
    );
    const version = JSON.parse(packageJson).version;

    const releaseInfo = gatherReleaseInfo(logPath, version);

    await publishToGithub(releaseInfo, version, project);
  }

  await releasePublish({
    projects: options.projects,
    dryRun: options.dryRun,
    verbose: options.verbose,
    firstRelease: options.firstRelease,
    outputStyle: 'static',
  });

  process.exit(0);
})();
