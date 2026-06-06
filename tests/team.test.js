/**
 * tests/team.test.js
 * Tests for /api/team endpoints:
 *  - Add / delete team members
 *  - Credit transfer between main user and member
 */

const request = require('supertest');
const { buildApp, db, User } = require('./helpers/testApp');

let app;
let mainAgent;   // logged-in main_user
let mainUserId;

beforeAll(async () => {
    await db.sync({ force: true });
    app = buildApp();

    // Create + log in as main user
    mainAgent = request.agent(app);
    await mainAgent.post('/auth/signup').send({ name: 'MainUser', email: 'main@test.com', password: 'Main1234!' });
    await mainAgent.post('/auth/login').send({ email: 'main@test.com', password: 'Main1234!' });

    // Give the main user some credits to work with
    const meRes = await mainAgent.get('/auth/me');
    mainUserId = meRes.body.id;
    await User.update({ credits: 100 }, { where: { id: mainUserId } });
});

afterAll(async () => {
    await db.close();
});

// ── Auth / Role Guards ─────────────────────────────────────────────────────────

describe('Team – guards', () => {
    test('unauthenticated user receives 401', async () => {
        const res = await request(app).post('/api/team/members/add').send({ name: 'X', email: 'x@x.com', password: '123' });
        expect(res.status).toBe(401);
    });

    test('team_member role receives 403 on add', async () => {
        // Add a member first
        await mainAgent.post('/api/team/members/add').send({ name: 'Mem0', email: 'mem0@test.com', password: 'Mem01234!' });

        const memberAg = request.agent(app);
        await memberAg.post('/auth/login').send({ email: 'mem0@test.com', password: 'Mem01234!' });

        const res = await memberAg.post('/api/team/members/add').send({ name: 'Hack', email: 'hack@test.com', password: '123' });
        expect(res.status).toBe(403);
    });
});

// ── Add Members ────────────────────────────────────────────────────────────────

describe('POST /api/team/members/add', () => {
    test('main user can add a team member', async () => {
        const res = await mainAgent.post('/api/team/members/add').send({
            name: 'Alice Member', email: 'alice.m@test.com', password: 'Alice1234!'
        });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Alice Member');
        expect(res.body.role).toBe('team_member');
        expect(res.body.parentId).toBe(mainUserId);
    });

    test('returns 400 if email is already registered', async () => {
        await mainAgent.post('/api/team/members/add').send({ name: 'Bob', email: 'bob.m@test.com', password: 'Bob1234!' });
        const res = await mainAgent.post('/api/team/members/add').send({ name: 'Bob2', email: 'bob.m@test.com', password: 'Bob1234!' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already registered/i);
    });
});

// ── Delete Members ─────────────────────────────────────────────────────────────

describe('DELETE /api/team/members/:id', () => {
    test('main user can delete their own member', async () => {
        const addRes = await mainAgent.post('/api/team/members/add').send({
            name: 'ToDelete', email: 'todelete@test.com', password: 'Del1234!'
        });
        const memberId = addRes.body.id;

        const delRes = await mainAgent.delete(`/api/team/members/${memberId}`);
        expect(delRes.status).toBe(200);
        expect(delRes.body.message).toMatch(/removed/i);
    });

    test('returns 404 when member does not belong to this main user', async () => {
        // Create a second main user
        const other = request.agent(app);
        await other.post('/auth/signup').send({ name: 'OtherMain', email: 'other.main@test.com', password: 'Other1234!' });
        await other.post('/auth/login').send({ email: 'other.main@test.com', password: 'Other1234!' });

        // Try to delete a member owned by first main user
        const addRes = await mainAgent.post('/api/team/members/add').send({
            name: 'ProtectedMember', email: 'protected@test.com', password: 'Prot1234!'
        });
        const memberId = addRes.body.id;

        const delRes = await other.delete(`/api/team/members/${memberId}`);
        expect(delRes.status).toBe(404);
    });
});

// ── Credit Transfer ────────────────────────────────────────────────────────────

describe('POST /api/team/credits/transfer', () => {
    let memberAgent;
    let memberId;

    beforeAll(async () => {
        const addRes = await mainAgent.post('/api/team/members/add').send({
            name: 'TransferMember', email: 'transfer.m@test.com', password: 'Trans1234!'
        });
        memberId = addRes.body.id;

        // Ensure main user has credits (reset after previous tests may have consumed them)
        await User.update({ credits: 100 }, { where: { id: mainUserId } });

        memberAgent = request.agent(app);
        await memberAgent.post('/auth/login').send({ email: 'transfer.m@test.com', password: 'Trans1234!' });
    });

    test('transfers credits from main user to member', async () => {
        const res = await mainAgent.post('/api/team/credits/transfer').send({
            targetUserId: memberId, amount: 30
        });
        expect(res.status).toBe(200);
        expect(res.body.mainUserCredits).toBe(70);
        expect(res.body.memberCredits).toBe(30);
    });

    test('returns 400 when main user has insufficient credits', async () => {
        // main user now has 70; try to transfer 200
        const res = await mainAgent.post('/api/team/credits/transfer').send({
            targetUserId: memberId, amount: 200
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/insufficient credits/i);
    });

    test('returns 400 when negative transfer exceeds member balance', async () => {
        // Member has 30; try to take 100 back
        const res = await mainAgent.post('/api/team/credits/transfer').send({
            targetUserId: memberId, amount: -100
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/insufficient credits/i);
    });

    test('returns 400 for amount = 0', async () => {
        const res = await mainAgent.post('/api/team/credits/transfer').send({
            targetUserId: memberId, amount: 0
        });
        expect(res.status).toBe(400);
    });

    test('returns 404 when targetUserId does not belong to this main user', async () => {
        const res = await mainAgent.post('/api/team/credits/transfer').send({
            targetUserId: 99999, amount: 10
        });
        expect(res.status).toBe(404);
    });
});
