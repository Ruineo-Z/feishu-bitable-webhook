import app from '../src/index';

async function verifyDocs() {
  console.log('Verifying OpenAPI Docs...');

  // 1. Check /doc endpoint
  const res = await app.fetch(new Request('http://localhost/doc'));
  console.log('GET /doc status:', res.status);

  if (res.status === 200) {
    const spec = await res.json();
    console.log('OpenAPI Version:', spec.openapi);
    console.log('Title:', spec.info.title);

    // Check if paths exist
    const paths = Object.keys(spec.paths);
    console.log(`Routes found: ${paths.length}`);
    console.log('Available paths:', paths);

    // Check if tags are applied
    // Note: Hono might normalize paths
    const logsPath = spec.paths['/api/logs'] || spec.paths['/api/logs/'];
    if (logsPath && logsPath.get && logsPath.get.tags && logsPath.get.tags.includes('Logs')) {
        console.log('✅ Logs tags verified');
    } else {
        console.log('❌ Logs tags missing');
    }

    const workflowPath = spec.paths['/api/workflows'] || spec.paths['/api/workflows/'];
    if (workflowPath && workflowPath.get && workflowPath.get.tags && workflowPath.get.tags.includes('Workflows')) {
        console.log('✅ Workflows tags verified');
    } else {
        console.log('❌ Workflows tags missing');
    }

  } else {
    console.log('Failed to fetch docs:', await res.text());
  }
}

verifyDocs().catch(console.error);
