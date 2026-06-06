/**
 * tests/auth.test.js
 * Tests for /auth/* endpoints (signup, login, logout, /me, change-password)
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

/**
 * Returns a supertest agent that keeps cookies across requests (simulates browser session).
 */
function agent() {
    return request.agent(app);
}

async function signupAndLogin(ag, email = 'test@example.com', password = 'Secret123!', name = 'Test User') {
    await ag.post('/auth/signup').send({ name, email, password });
    return ag.post('/auth/login').send({ email, password });
}

// ── Signup ─────────────────────────────────────────────────────────────────────

describe('POST /auth/signup', () => {
    test('creates a new user and returns 200', async () => {
        const ag = agent();
        const res = await ag.post('/auth/signup').send({
            name: 'Alice', email: 'alice@test.com', password: 'Password1!'
        });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/signup successful/i);
    });

    test('rejects duplicate email with 400', async () => {
        const ag = agent();
        await ag.post('/auth/signup').send({ name: 'Bob', email: 'bob@test.com', password: 'Password1!' });
        const res = await ag.post('/auth/signup').send({ name: 'Bob2', email: 'bob@test.com', password: 'Password1!' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already registered/i);
    });
});

// ── Login ──────────────────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
    beforeAll(async () => {
        // Seed a known user for login tests
        const ag = agent();
        await ag.post('/auth/signup').send({ name: 'Charlie', email: 'charlie@test.com', password: 'MyPass99!' });
    });

    test('logs in with correct credentials', async () => {
        const ag = agent();
        const res = await ag.post('/auth/login').send({ email: 'charlie@test.com', password: 'MyPass99!' });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/login successful/i);
    });

    test('returns 400 with wrong password', async () => {
        const ag = agent();
        const res = await ag.post('/auth/login').send({ email: 'charlie@test.com', password: 'WrongPass!' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBeDefined();
    });

    test('returns 400 for unknown email', async () => {
        const ag = agent();
        const res = await ag.post('/auth/login').send({ email: 'nobody@test.com', password: 'Whatever1!' });
        expect(res.status).toBe(400);
    });
});

// ── GET /auth/me ───────────────────────────────────────────────────────────────

describe('GET /auth/me', () => {
    test('returns 401 when not logged in', async () => {
        const res = await request(app).get('/auth/me');
        expect(res.status).toBe(401);
    });

    test('returns user profile when authenticated', async () => {
        const ag = agent();
        await signupAndLogin(ag, 'dave@test.com', 'Dave1234!', 'Dave');
        const res = await ag.get('/auth/me');
        expect(res.status).toBe(200);
        expect(res.body.email).toBe('dave@test.com');
        expect(res.body.role).toBe('main_user');
        expect(res.body).not.toHaveProperty('password'); // password must never be exposed
    });
});

// ── GET /auth/logout ───────────────────────────────────────────────────────────

describe('GET /auth/logout', () => {
    test('logs out a logged-in user; /me then returns 401', async () => {
        const ag = agent();
        await signupAndLogin(ag, 'eve@test.com', 'Eve9876!', 'Eve');

        await ag.get('/auth/logout');
        const res = await ag.get('/auth/me');
        expect(res.status).toBe(401);
    });
});

// ── POST /auth/change-password ────────────────────────────────────────────────

describe('POST /auth/change-password', () => {
    test('returns 401 when not authenticated', async () => {
        const res = await request(app).post('/auth/change-password')
            .send({ currentPassword: 'old', newPassword: 'new' });
        expect(res.status).toBe(401);
    });

    test('rejects wrong current password with 400', async () => {
        const ag = agent();
        await signupAndLogin(ag, 'frank@test.com', 'Frank111!', 'Frank');
        const res = await ag.post('/auth/change-password').send({
            currentPassword: 'WrongCurrent!',
            newPassword: 'NewPass999!'
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/incorrect current password/i);
    });

    test('changes password successfully with correct current password', async () => {
        const ag = agent();
        await signupAndLogin(ag, 'grace@test.com', 'Grace111!', 'Grace');
        const res = await ag.post('/auth/change-password').send({
            currentPassword: 'Grace111!',
            newPassword: 'Grace999!'
        });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/password changed/i);

        // Verify that the new password works
        await ag.get('/auth/logout');
        const loginRes = await ag.post('/auth/login').send({ email: 'grace@test.com', password: 'Grace999!' });
        expect(loginRes.status).toBe(200);
    });
});
