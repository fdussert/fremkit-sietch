/**
 * Packs one fixed folder and prints the sha256, so a caller can compare two timezones.
 *
 * A separate file run in a child process, because `TZ` is read once when a process starts: the
 * only honest way to test "the same bytes in every zone" is to be in another zone.
 */
import { packageZip, sha256 } from '../../build.js'

const files = [
  { name: 'index.html', data: Buffer.from('<html></html>') },
  { name: 'manifest.json', data: Buffer.from('{}') },
]
process.stdout.write(sha256(packageZip({ files })))
