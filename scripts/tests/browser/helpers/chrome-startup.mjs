// Wait for a browser's debugging endpoint, reporting startup failures immediately.
// Keep stderr bounded: it is useful when the hosted runner fails before tests run.
export function waitForChromeEndpoint(chrome, executable, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const diagnostic = message => new Error(`${message} (${executable})\nChrome stderr:\n${stderr.trim() || '(no stderr output)'}`);
    const cleanup = () => {
      clearTimeout(timer);
      chrome.stderr.removeListener('data', onData);
      chrome.removeListener('error', onError);
      chrome.removeListener('exit', onExit);
    };
    const finish = (error, url) => { cleanup(); error ? reject(error) : resolve(url); };
    const onData = chunk => {
      stderr = (stderr + chunk.toString()).slice(-8192);
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) finish(null, match[1]);
    };
    const onError = error => finish(diagnostic(`Chrome launch failed: ${error.message}`));
    const onExit = (code, signal) => finish(diagnostic(`Chrome exited before readiness: code=${code}, signal=${signal || 'none'}`));
    const timer = setTimeout(() => finish(diagnostic(`Chrome did not become ready within ${timeoutMs}ms`)), timeoutMs);
    chrome.stderr.on('data', onData);
    chrome.once('error', onError);
    chrome.once('exit', onExit);
  });
}
