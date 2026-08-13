#!/usr/bin/env node
/**
 * Prints an `ADMIN_PASSWORD_HASH` line for your `.env` file.
 *
 * The passphrase is read from the terminal with echo suppressed, hashed with
 * scrypt, and discarded — it is never written to disk, never logged, and never
 * passed as a command-line argument (which would land it in your shell history).
 *
 *   pnpm auth:set-password
 */
import { createInterface } from 'node:readline'
import { randomBytes, scryptSync } from 'node:crypto'

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 }

function hashPassword(password) {
  const salt = randomBytes(16)
  const { N, r, p, keylen } = SCRYPT_PARAMS
  const key = scryptSync(password.normalize('NFKC'), salt, keylen, { N, r, p })
  return ['scrypt', N, r, p, salt.toString('hex'), key.toString('hex')].join('$')
}

function prompt(question, { silent = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })

    if (silent) {
      // Swallow the echoed characters so the passphrase never appears on screen.
      const onData = (char) => {
        if (['\n', '\r', ''].includes(char.toString('utf8'))) {
          process.stdin.removeListener('data', onData)
        } else {
          process.stdout.write('[2K[200D' + question)
        }
      }
      process.stdin.on('data', onData)
    }

    rl.question(question, (answer) => {
      rl.close()
      if (silent) process.stdout.write('\n')
      resolve(answer)
    })
  })
}

const password = await prompt('Admin passphrase: ', { silent: true })

if (password.length < 12) {
  console.error(
    '\nRefusing: this is the only credential guarding every admin action.\n' +
      'Use at least 12 characters — a passphrase of a few random words is ideal.',
  )
  process.exit(1)
}

const confirm = await prompt('Confirm passphrase: ', { silent: true })

if (password !== confirm) {
  console.error('\nThose did not match. Nothing was changed.')
  process.exit(1)
}

console.log(
  [
    '',
    'Add this line to your .env file (and restart the server):',
    '',
    `ADMIN_PASSWORD_HASH=${hashPassword(password)}`,
    '',
    'Changing this later signs out every admin session, by design.',
    '',
  ].join('\n'),
)
