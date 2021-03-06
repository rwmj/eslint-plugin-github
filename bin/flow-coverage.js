#!/usr/bin/env node
// usage: flow-coverage 95
//
// Run flow coverage on project.

const childProcess = require('child_process')
const flow = require('flow-bin')

const execFile = (file, args) =>
  new Promise((resolve, reject) => {
    childProcess.execFile(
      file,
      args,
      {
        maxBuffer: Infinity
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error)
        } else {
          resolve({stdout, stderr})
        }
      }
    )
  })

async function execFileJSON(file, args) {
  args.push('--json')
  const {stdout} = await execFile(file, args)
  return JSON.parse(stdout)
}

function computeCoverage(covered, uncovered) {
  return 100 * (covered / (covered + uncovered))
}

async function getCoverage(path) {
  const json = await execFileJSON(flow, ['coverage', path])
  const uncoveredCount = json.expressions['uncovered_count']
  const coveredCount = json.expressions['covered_count']
  const covered = computeCoverage(coveredCount, uncoveredCount)
  return {path, uncoveredCount, coveredCount, covered}
}

async function startFlow() {
  try {
    await execFile(flow, ['start', '--wait'])
  } catch (error) {
    if (error.code === 11) {
      /* already running */
    } else {
      throw error
    }
  }
}

const ignore = [/\.flowconfig$/, /\.json$/, /\.test\.js$/, /\/__generated__\//, /\/flow-typed\//, /\/node_modules\//]

async function flowList() {
  execFile('git', ['grep', '--name-only', '--', '@flow'])

  const paths = await execFileJSON(flow, ['ls'])
  return paths.filter(path => !ignore.some(re => re.test(path)))
}

async function grepFlowFiles() {
  const {stdout} = await execFile('git', ['grep', '--null', '--name-only', '--', '@flow'])
  return stdout.split('\0').filter(path => path)
}

;(async function() {
  const threshold = parseInt(process.argv[2])

  await startFlow()

  const files = await grepFlowFiles()

  let totalCoveredCount = 0
  let totalUncoveredCount = 0

  for (const file of files) {
    const {path, covered, coveredCount, uncoveredCount} = await getCoverage(file)
    process.stdout.write(`${covered.toFixed()}\t${path}\n`)
    totalCoveredCount += coveredCount
    totalUncoveredCount += uncoveredCount
  }

  const totalCoverage = computeCoverage(totalCoveredCount, totalUncoveredCount)

  process.stdout.write(`${totalCoverage.toFixed()}\t(total)\n`)
  if (totalCoverage < threshold) {
    process.stderr.write(`expected at least ${threshold}% coverage, but was ${totalCoverage.toFixed()}%\n`)
    process.exit(1)
  }
})().catch(error => {
  process.stderr.write(`${error}\n`)
  process.exit(2)
})
