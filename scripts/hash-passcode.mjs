// Prints an APP_PASSCODE_HASH value ("salt:hash") for the passcode read from stdin.
//   npm run hash-passcode
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: process.stdin.isTTY });
if (process.stdin.isTTY) {
  process.stderr.write("Passcode: ");
  rl._writeToOutput = () => {}; // don't echo what's typed
}
rl.question("", (passcode) => {
  rl.close();
  if (process.stdin.isTTY) process.stderr.write("\n");
  if (!passcode) {
    console.error("No passcode given.");
    process.exit(1);
  }
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(passcode.normalize(), salt, 64).toString("hex");
  console.log(`${salt}:${hash}`);
});
