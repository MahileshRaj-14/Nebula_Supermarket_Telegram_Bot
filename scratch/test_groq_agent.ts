import 'dotenv/config';
import { processAgentMessage } from '../src/agent/agent.js';
import prisma from '../src/db/client.js';

async function testGroqAgent() {
  console.log('--- Testing Groq ToolLoopAgent ---');
  const userId = 'test_groq_user';

  // Query 1: Inventory stock check
  console.log('\nUser: "How much Maggi do we have?"');
  const res1 = await processAgentMessage(userId, 'How much Maggi do we have?');
  console.log('Agent Response:', res1.text);

  // Query 2: Receive stock
  console.log('\nUser: "Add 20 Maggi packets."');
  const res2 = await processAgentMessage(userId, 'Add 20 Maggi packets.');
  console.log('Agent Response:', res2.text);

  // Query 3: Billing
  console.log('\nUser: "Bill 2 Maggi."');
  const res3 = await processAgentMessage(userId, 'Bill 2 Maggi.');
  console.log('Agent Response:', res3.text);

  await prisma.$disconnect();
}

testGroqAgent().catch(console.error);
