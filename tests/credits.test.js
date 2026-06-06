/**
 * tests/credits.test.js
 * Tests for /api/credits endpoints (get balance, purchase).
 */

const request = require('supertest');
const { buildApp, db } = require('./helpers/testApp');

let app;

beforeAll(async () => {
    await db.sync({ force: true });
    app = buildApp();
});

afterAll(async () => {
    await db.close();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function agent() {
    return request.agent(app);
}

/** Signs up + logs in; returns the supertest agent (with session cookie). */
async function loginAs(ag, email, password = 'Pass1234!', name = 'User') {
    await ag.post('/auth/signup').send({ name, email, password });
    await ag.post('/auth/login').send({ email, password });
}

// ── Guard: Unauthenticated ─────────────────────────────────────────────────────

describe('Credits – unauthenticated access', () => {
    test('GET /api/credits returns 401', async () => {
        const res = await request(app).get('/api/credits');
        expect(res.status).toBe(401);
    });

    test('POST /api/credits/purchase returns 401', async () => {
        const res = await request(app).post('/api/credits/purchase').send({ amount: 10 });
        expect(res.status).toBe(401);
    });
});

// ── Guard: team_member role ────────────────────────────────────────────────────

describe('Credits – team_member role is denied', () => {
    test('GET /api/credits returns 403 for team_member', async () => {
        const mainAg = agent();
        await loginAs(mainAg, 'main1@test.com', 'Main1234!', 'Main1');

        // Create a team member via team route
        const res = await mainAg.post('/api/team/members/add').send({
            name: 'Member1', email: 'member1@test.com', password: 'Mem1234!'
        });
        expect(res.status).toBe(200);

        const memberAg = agent();
        await memberAg.post('/auth/login').send({ email: 'member1@test.com', password: 'Mem1234!' });

        const credRes = await memberAg.get('/api/credits');
        expect(credRes.status).toBe(403);
    });
});

// ── Main user reads credits ────────────────────────────────────────────────────

describe('GET /api/credits', () => {
    test('returns credits balance (defaults to 0)', async () => {
        const ag = agent();
        await loginAs(ag, 'credituser@test.com', 'Pass1234!', 'Credit User');
        const res = await ag.get('/api/credits');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('credits');
        expect(res.body.credits).toBe(0);
    });
});

// ── Purchase credits ──────────────────────────────────────────────────────────

describe('POST /api/credits/purchase', () => {
    test('adds credits to main user account', async () => {
        const ag = agent();
        await loginAs(ag, 'buy1@test.com', 'Buy1234!', 'Buyer 1');

        const res = await ag.post('/api/credits/purchase').send({ amount: 50 });
        expect(res.status).toBe(200);
        expect(res.body.credits).toBe(50);
        expect(res.body.message).toMatch(/purchased successfully/i);
    });

    test('accumulates credits across multiple purchases', async () => {
        const ag = agent();
        await loginAs(ag, 'buy2@test.com', 'Buy2234!', 'Buyer 2');

        await ag.post('/api/credits/purchase').send({ amount: 30 });
        const res = await ag.post('/api/credits/purchase').send({ amount: 20 });
        expect(res.body.credits).toBe(50);
    });

    test('rejects zero amount with 400', async () => {
        const ag = agent();
        await loginAs(ag, 'buy3@test.com', 'Buy3234!', 'Buyer 3');

        const res = await ag.post('/api/credits/purchase').send({ amount: 0 });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/invalid amount/i);
    });

    test('rejects negative amount with 400', async () => {
        const ag = agent();
        await loginAs(ag, 'buy4@test.com', 'Buy4234!', 'Buyer 4');

        const res = await ag.post('/api/credits/purchase').send({ amount: -5 });
        expect(res.status).toBe(400);
    });

    test('rejects non-numeric amount with 400', async () => {
        const ag = agent();
        await loginAs(ag, 'buy5@test.com', 'Buy5234!', 'Buyer 5');

        const res = await ag.post('/api/credits/purchase').send({ amount: 'abc' });
        expect(res.status).toBe(400);
    });
});
