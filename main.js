import * as fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

import { Octokit } from '@octokit/rest'
import micromatch from 'micromatch'
import { globby } from 'globby'
import { execa } from 'execa'
import assert from 'node:assert'

// github_pat_* will not work...
const octokit = new Octokit({
	auth: process.env.GITHUB_AUTH_TOKEN,
})

/**
 * @typedef GetObjectWithFilterOption
 * @type {object}
 * @property {string[]} ignoredOrganizations
 */

/**
 * @param {GetObjectWithFilterOption} options
 */
async function getObjectWithFilter(allOrgs, options = {}) {
	let ignoredOrganizations = options.ignoredOrganizations ?? []

	const myOrgs = allOrgs
		.map((item) => item.organization.login)
		.filter((org) => !ignoredOrganizations.includes(org))
	const myRepos = await Promise.all(
		myOrgs.map((orgName) => {
			return octokit
				.request('GET /orgs/{org}/repos', {
					org: orgName,
					headers: {
						'X-GitHub-Api-Version': '2022-11-28',
					},
				})
				.then((res) => {
					return res.data.map((item) => item.name)
				})
		}),
	)

	const map = new Map()
	for (let i = 0; i < myRepos.length; ++i) {
		let org = myOrgs[i]
		let repos = myRepos[i]

		map.set(org, repos)
	}

	return { myOrgs, map }
}

{
	const ignoredOrganizations = [
		// Manually managed
		'asdf-contrib-hyperupcall',
		'fox-archives',
		'fox-forks',
		'fox-templates',
		'quasipanacea',
		'fix-js',

		// Empty organizations

		// Do not manage
		'CodeDay-Init',
		'eshsrobotics',
		'gamedevunite-at-smc',
		'cs-club-smc',
		'GameDevUniteAtECC',
		'ecc-cs-club',
		'hackclub',
		'hackclub-ctf',
		'replit-discord',
	]
	const { data: allOrgs } = await octokit.rest.orgs.listMembershipsForAuthenticatedUser({
		per_page: 100,
	})
	const { map } = await getObjectWithFilter(allOrgs, {
		ignoredOrganizations,
	})
	assert(map.size !== 100, 'per_page should not reach 100')

	const rootDir = path.join(os.homedir(), 'Docs/Programming/Repositories')
	let allOrgRepos = Array.from(map.keys())
		.map((orgName) => map.get(orgName).map((repoName) => `${orgName}/${repoName}`))
		.flat()
	let { data: hyperupcallRepos } = await octokit.repos.listForAuthenticatedUser({
		affiliation: 'owner',
		per_page: 100,
	})
	hyperupcallRepos = hyperupcallRepos.map((repo) => repo.full_name)
	allOrgRepos = allOrgRepos.concat(hyperupcallRepos)

	// 1:1 check that each directory has a remote
	{
		for (let orgEntry of await fs.readdir(rootDir, { withFileTypes: true })) {
			if (!orgEntry.isDirectory()) {
				console.error(`Must be dir: ${orgEntry.path}${orgEntry.name}`)
				continue
			}

			if (ignoredOrganizations.includes(orgEntry.name)) {
				continue
			}

			for (let repoEntry of await fs.readdir(path.join(orgEntry.path, orgEntry.name), {
				withFileTypes: true,
			})) {
				if (!repoEntry.isDirectory()) {
					console.error(`Must be dir: ${repoEntry.path}${repoEntry.name}`)
				}

				if (!allOrgRepos.includes(`${orgEntry.name}/${repoEntry.name}`)) {
					console.error(
						`Directory has no corresponding remote repository: ${repoEntry.path}/${repoEntry.name}`,
					)
				}
			}
		}
	}

	// for (let org of map.keys()) {
	// 	let repos = map.get(org)
	// 	// console.log(org, repos.length)
	// 	for (let repo of repos) {
	// 		let p = path.join(dir, org, repo)

	// 		if (!existsSync(p)) {
	// 			console.log(`❌ ${org}/${repo} (IS NOT CLONED)`)
	// 			// const { stdout, stderr } = await execa('git', ['clone', `gh:${org}/${repo}`, p])
	// 			// console.log(stdout, stderr)
	// 		}

	// 		// if (
	// 		// 	(
	// 		// 		await globby('README*', {
	// 		// 			cwd: path.join(dir, org, repo),
	// 		// 		})
	// 		// 	).length === 0
	// 		// ) {
	// 		// 	console.log(`❌ ${org}/${repo} (NO README)`)
	// 		// 	continue
	// 		// }

	// 		// if (!ffs.existsSync(path.join(dir, org, repo, '.editorconfig'))) {
	// 		// 	console.log(`❌ ${org}/${repo} (NO EDITORCONFIG)`)
	// 		// 	continue
	// 		// }

	// 		// console.log(`✅ ${org}/${repo}`)
	// 	}

	// 	// if (repos.length === 0) {
	// 	// 	let p = path.join(dir, org)

	// 	// 	let exist = ffs.existsSync(p)
	// 	// 	if (!exist) {
	// 	// 		console.log(`Organization does not exist: ${org}`)
	// 	// 	}
	// 	// }
	// }
}
