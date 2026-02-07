import app from '../../src/routes/workflow';

async function runApiTests() {
  console.log('Running Workflow API Tests...');

  // 1. List Workflows
  try {
      const res = await app.request('http://localhost/', {
        method: 'GET'
      });

      console.log('GET / status:', res.status);
      if (res.status === 200) {
          const data = await res.json();
          console.log('List success, count:', (data as any).data?.length);
      } else {
          console.log('List failed:', await res.text());
      }
  } catch (e) {
      console.error('GET / error:', e);
  }

  // 2. Create Workflow
  const newWorkflow = {
    name: 'API Test Workflow',
    config: {
      id: 'temp-id',
      name: 'API Test Workflow',
      trigger: { type: 'manual', config: {} },
      steps: []
    },
    isActive: true
  };

  let createdId = '';

  try {
      const createRes = await app.request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWorkflow)
      });

      console.log('POST / status:', createRes.status);

      if (createRes.status === 201) {
          const data = await createRes.json();
          createdId = (data as any).id;
          console.log('Created workflow ID:', createdId);
      } else {
          console.log('Create failed:', await createRes.text());
      }
  } catch (e) {
      console.error('POST / error:', e);
  }

  // 3. Get Workflow
  if (createdId) {
      const getRes = await app.request(`http://localhost/${createdId}`, { method: 'GET' });
      console.log('GET /:id status:', getRes.status);
  }

  // 4. Delete Workflow
  if (createdId) {
      const delRes = await app.request(`http://localhost/${createdId}`, { method: 'DELETE' });
      console.log('DELETE /:id status:', delRes.status);
  }
}

runApiTests().catch(console.error);
