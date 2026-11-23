// Settings shared by the local SSO browser checks. Credentials come only from the environment.
export function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name}; see infra/sso/README.md (Local browser checks).`);
    process.exit(2);
  }
  return value;
}

export function screenshotDir() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Pass a directory for screenshots as the first argument.');
    process.exit(2);
  }
  return dir;
}
