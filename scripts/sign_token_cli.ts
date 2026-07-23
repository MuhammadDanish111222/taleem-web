import { signInternalJwt } from '../lib/internalAuth/signInternalJwt';

async function main() {
  const token = await signInternalJwt(
    process.argv[2] || 'ts-user-456',
    process.argv[3] === 'true',
    process.argv[4] || 'ingestion',
    process.argv[5] || 'ts-req-789'
  );
  process.stdout.write(token);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
