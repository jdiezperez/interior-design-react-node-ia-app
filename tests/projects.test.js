/**
 * tests/projects.test.js
 * Tests for /api/projects endpoints:
 *  - Project categories (add, duplicate)
 *  - Projects (add, duplicate name, delete, 404)
 */

const request = require('supertest');
const { buildApp, db } = require('./helpers/testApp');

let app;
let ag;  // authenticated main user agent

beforeAll(async () => {
    await db.sync({ force: true });
    app = buildApp();

    ag = request.agent(app);
    await ag.post('/auth/signup').send({ name: 'ProjUser', email: 'proj@test.com', password: 'Proj1234!' });
    await ag.post('/auth/login').send({ email: 'proj@test.com', password: 'Proj1234!' });
});

afterAll(async () => {
    await db.close();
});

// ── Guard ──────────────────────────────────────────────────────────────────────

describe('Projects – auth guard', () => {
    test('POST /api/projects/add returns 401 for unauthenticated request', async () => {
        const res = await request(app).post('/api/projects/add').send({ name: 'X', projectCategoryId: 1 });
        expect(res.status).toBe(401);
    });
});

// ── Project Categories ─────────────────────────────────────────────────────────

describe('POST /api/projects/categories/add', () => {
    test('creates a new category', async () => {
        const res = await ag.post('/api/projects/categories/add').send({ name: 'Living Room' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Living Room');
    });

    test('rejects category with empty name', async () => {
        const res = await ag.post('/api/projects/categories/add').send({ name: '' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/name is required/i);
    });

    test('rejects missing name field', async () => {
        const res = await ag.post('/api/projects/categories/add').send({});
        expect(res.status).toBe(400);
    });

    test('rejects duplicate category name for the same user', async () => {
        await ag.post('/api/projects/categories/add').send({ name: 'Kitchen' });
        const res = await ag.post('/api/projects/categories/add').send({ name: 'Kitchen' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already exists/i);
    });

    test('allows same category name for different users', async () => {
        const otherAg = request.agent(app);
        await otherAg.post('/auth/signup').send({ name: 'OtherUser', email: 'other@test.com', password: 'Other1234!' });
        await otherAg.post('/auth/login').send({ email: 'other@test.com', password: 'Other1234!' });

        // "Living Room" was already created by the main `ag` user; should be fine for `otherAg`
        const res = await otherAg.post('/api/projects/categories/add').send({ name: 'Living Room' });
        expect(res.status).toBe(200);
    });
});

// ── Projects ───────────────────────────────────────────────────────────────────

describe('POST /api/projects/add', () => {
    let catId;

    beforeAll(async () => {
        const catRes = await ag.post('/api/projects/categories/add').send({ name: 'Bedroom' });
        catId = catRes.body.id;
    });

    test('creates a new project inside a category', async () => {
        const res = await ag.post('/api/projects/add').send({ name: 'Master Bedroom', projectCategoryId: catId });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Master Bedroom');
        expect(res.body.projectCategoryId).toBe(catId);
    });

    test('returns 400 for missing name', async () => {
        const res = await ag.post('/api/projects/add').send({ projectCategoryId: catId });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/missing fields/i);
    });

    test('returns 400 for missing projectCategoryId', async () => {
        const res = await ag.post('/api/projects/add').send({ name: 'Some Project' });
        expect(res.status).toBe(400);
    });

    test('rejects duplicate project name for the same user', async () => {
        await ag.post('/api/projects/add').send({ name: 'Duplicate Project', projectCategoryId: catId });
        const res = await ag.post('/api/projects/add').send({ name: 'Duplicate Project', projectCategoryId: catId });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already exists/i);
    });
});

// ── Delete Project ─────────────────────────────────────────────────────────────

describe('DELETE /api/projects/:id', () => {
    let catId;
    let projectId;

    beforeAll(async () => {
        const catRes = await ag.post('/api/projects/categories/add').send({ name: 'Office' });
        catId = catRes.body.id;
        const projRes = await ag.post('/api/projects/add').send({ name: 'Home Office', projectCategoryId: catId });
        projectId = projRes.body.id;
    });

    test('deletes an existing project', async () => {
        const res = await ag.delete(`/api/projects/${projectId}`);
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/deleted/i);
    });

    test('returns 404 when project does not exist', async () => {
        const res = await ag.delete('/api/projects/99999');
        expect(res.status).toBe(404);
    });

    test('cannot delete another user\'s project', async () => {
        const otherAg = request.agent(app);
        await otherAg.post('/auth/signup').send({ name: 'Attacker', email: 'attacker@test.com', password: 'Attack1234!' });
        await otherAg.post('/auth/login').send({ email: 'attacker@test.com', password: 'Attack1234!' });

        // Create a project for the original user
        const catRes = await ag.post('/api/projects/categories/add').send({ name: 'Private Room' });
        const projRes = await ag.post('/api/projects/add').send({ name: 'My Secret Project', projectCategoryId: catRes.body.id });

        const res = await otherAg.delete(`/api/projects/${projRes.body.id}`);
        expect(res.status).toBe(404); // ownership check should prevent deletion
    });
});
