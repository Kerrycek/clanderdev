function extractPolicyValue(source) {
  const marker = 'Content-Security-Policy';
  const markerIndex = source.indexOf(marker);

  if (markerIndex === -1) return source;

  const quotedValue = source.slice(markerIndex + marker.length).match(/"([^"]*)"/);
  return quotedValue?.[1] ?? source.slice(markerIndex + marker.length);
}

export function getCspDirectiveTokens(source, directiveName) {
  const policy = extractPolicyValue(source);

  for (const rawDirective of policy.split(';')) {
    const [name, ...tokens] = rawDirective.trim().split(/\s+/);

    if (name?.toLowerCase() === directiveName.toLowerCase()) {
      return tokens;
    }
  }

  return null;
}

export function validateScriptSource(source, requiredHash) {
  const tokens = getCspDirectiveTokens(source, 'script-src');

  if (!tokens) return ['has no script-src directive'];

  const errors = [];

  if (!tokens.includes("'self'")) {
    errors.push("script-src does not allow 'self'");
  }
  if (!tokens.includes(`'${requiredHash}'`)) {
    errors.push('script-src does not include the current inline-script hash');
  }
  if (tokens.includes("'unsafe-inline'")) {
    errors.push('script-src allows unsafe inline scripts');
  }

  return errors;
}
