import fs from 'node:fs';
import path from 'node:path';

function assertNotSymlink(target) {
  try {
    if (fs.lstatSync(target).isSymbolicLink()) {
      throw new Error(`Refusing symlinked live audit path: ${target}`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function assertNoSymlinkAncestors(target) {
  const resolved = path.resolve(target);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw new Error(`Refusing symlinked live audit path: ${current}`);
      }
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
  }
}

function assertWithinRoot(target, root) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Live audit path escapes its private root: ${target}`);
  }
}

export function ensurePrivateDirectory(target, privateRoot = target) {
  const resolved = path.resolve(target);
  const root = path.resolve(privateRoot);
  assertWithinRoot(resolved, root);
  assertNoSymlinkAncestors(root);
  assertNoSymlinkAncestors(resolved);
  let current = root;
  const relative = path.relative(root, resolved);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    assertNotSymlink(current);
  }
  fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  assertNoSymlinkAncestors(resolved);
  assertNotSymlink(resolved);
  if (!fs.statSync(resolved).isDirectory()) throw new Error(`Live audit path is not a directory: ${resolved}`);
  fs.chmodSync(resolved, 0o700);
  return resolved;
}

export function writePrivateFile(target, contents, privateRoot = path.dirname(target)) {
  const resolved = path.resolve(target);
  const root = path.resolve(privateRoot);
  assertWithinRoot(resolved, root);
  assertNoSymlinkAncestors(root);
  ensurePrivateDirectory(path.dirname(resolved), root);
  assertNoSymlinkAncestors(resolved);
  assertNotSymlink(resolved);
  const flags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_TRUNC
    | (fs.constants.O_NOFOLLOW ?? 0);
  const descriptor = fs.openSync(resolved, flags, 0o600);
  try {
    fs.fchmodSync(descriptor, 0o600);
    fs.writeFileSync(descriptor, contents);
  } finally {
    fs.closeSync(descriptor);
  }
  assertNotSymlink(resolved);
  fs.chmodSync(resolved, 0o600);
  return resolved;
}
