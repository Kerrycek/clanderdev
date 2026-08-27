#!/usr/bin/env node
import { auditDeployments } from './deployment-parity.mjs'

function usage() {
  return `Usage: node scripts/audit-deployment-parity.mjs [options]

Read-only deployment serving-layer parity audit. Only anonymous GET requests
are sent; cookies, authorization headers and response bodies are never reported.

Options:
  --candidate <origin>              candidate origin (default: https://dev.crucio.cz)
  --reference <origin>              reference origin (default: https://clankerdev.vpsfree.cz)
  --allow-invalid-candidate-cert    allow the known self-signed dev certificate
  --allow-invalid-reference-cert    allow an invalid reference certificate
  --timeout-ms <milliseconds>       per-request timeout (default: 15000)
  --json                            emit the redacted JSON report
  --help                            show this help
`
}

function parseArgs(argv) {
  const options = {
    candidateOrigin: 'https://dev.crucio.cz',
    referenceOrigin: 'https://clankerdev.vpsfree.cz',
    allowInvalidCandidateCertificate: false,
    allowInvalidReferenceCertificate: false,
    timeoutMs: 15_000,
    json: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help') return { help: true }
    if (argument === '--json') options.json = true
    else if (argument === '--allow-invalid-candidate-cert') options.allowInvalidCandidateCertificate = true
    else if (argument === '--allow-invalid-reference-cert') options.allowInvalidReferenceCertificate = true
    else if (argument === '--candidate') options.candidateOrigin = argv[++index]
    else if (argument === '--reference') options.referenceOrigin = argv[++index]
    else if (argument === '--timeout-ms') options.timeoutMs = Number(argv[++index])
    else throw new Error(`Unknown argument: ${argument}`)
  }

  if (!options.candidateOrigin || !options.referenceOrigin) throw new Error('candidate and reference origins are required')
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 120_000) {
    throw new Error('--timeout-ms must be an integer between 100 and 120000')
  }

  return options
}

function printSummary(report) {
  console.log(report.ok ? 'Deployment parity audit: PASS' : 'Deployment parity audit: FAIL')
  console.log(`Candidate: ${report.candidate.origin}`)
  console.log(`Reference: ${report.reference.origin}`)
  console.log(`Assets: ${Object.keys(report.candidate.assets).join(', ') || '(none)'}`)

  if (report.candidateViolations.length > 0) {
    console.log('\nCandidate contract violations:')
    for (const violation of report.candidateViolations) console.log(`- ${violation}`)
  }

  if (report.parityViolations.length > 0) {
    console.log('\nBlocking parity differences:')
    for (const violation of report.parityViolations) console.log(`- ${violation}`)
  }

  if (report.observations.length > 0) {
    console.log('\nNon-blocking observations:')
    for (const observation of report.observations) console.log(`- ${observation}`)
  }
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    process.exit(0)
  }

  const report = await auditDeployments(options)
  if (options.json) console.log(JSON.stringify(report, null, 2))
  else printSummary(report)
  process.exitCode = report.ok ? 0 : 1
} catch (error) {
  console.error(`Deployment parity audit failed: ${error?.message ?? String(error)}`)
  process.exitCode = 2
}
