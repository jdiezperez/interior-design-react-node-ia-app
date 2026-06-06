/**
 * tests/furniture.test.js
 * Tests for /api/furniture endpoints:
 *  - Categories (list, add, delete)
 *  - Furniture items (add, delete)
 *  - Role guards (team_member cannot create/delete)
 */

const request = require('supertest');
const { buildApp, db } = require('./helpers/testApp');

let app;
let mainAg;    // main_user agent
let memberAg;  // team_member agent

beforeAll(async () => {
    await db.sync({ force: true });
    app = buildApp();

    mainAg = request.agent(app);
    await mainAg.post('/auth/signup').send({ name: 'FurnMain', email: 'furnmain@test.com', password: 'Furn1234!' });
    await mainAg.post('/auth/login').send({ email: 'furnmain@test.com', password: 'Furn1234!' });

    // Add a team member for role tests
    await mainAg.post('/api/team/members/add').send({ name: 'FurnMember', email: 'furnmember@test.com', password: 'FurnM1234!' });

    memberAg = request.agent(app);
    await memberAg.post('/auth/login').send({ email: 'furnmember@test.com', password: 'FurnM1234!' });
});

afterAll(async () => {
    await db.close();
});

// ── Auth Guards ────────────────────────────────────────────────────────────────

describe('Furniture – auth guard', () => {
    test('GET /api/furniture/categories returns 401 when not logged in', async () => {
        const res = await request(app).get('/api/furniture/categories');
        expect(res.status).toBe(401);
    });
});

// ── GET Categories ─────────────────────────────────────────────────────────────

describe('GET /api/furniture/categories', () => {
    test('returns empty array when user has no furniture categories', async () => {
        const res = await mainAg.get('/api/furniture/categories');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('team_member can read categories (shared with parent)', async () => {
        const res = await memberAg.get('/api/furniture/categories');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});

// ── Add Category ───────────────────────────────────────────────────────────────

describe('POST /api/furniture/categories/add', () => {
    test('main user can add a furniture category', async () => {
        const res = await mainAg.post('/api/furniture/categories/add').send({ name: 'Sofas' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Sofas');
    });

    test('returns 400 if name is missing', async () => {
        const res = await mainAg.post('/api/furniture/categories/add').send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/name is required/i);
    });

    test('team_member cannot add a category (403)', async () => {
        const res = await memberAg.post('/api/furniture/categories/add').send({ name: 'Chairs' });
        expect(res.status).toBe(403);
    });
});

// ── Add Furniture Item ─────────────────────────────────────────────────────────

describe('POST /api/furniture/add', () => {
    let catId;

    beforeAll(async () => {
        const res = await mainAg.post('/api/furniture/categories/add').send({ name: 'Tables' });
        catId = res.body.id;
    });

    test('main user can add a furniture item to a valid category', async () => {
        const res = await mainAg.post('/api/furniture/add').send({ name: 'Oak Coffee Table', furnitureCategoryId: catId });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Oak Coffee Table');
        expect(res.body.furnitureCategoryId).toBe(catId);
    });

    test('returns 404 for a non-existent category', async () => {
        const res = await mainAg.post('/api/furniture/add').send({ name: 'Desk', furnitureCategoryId: 99999 });
        expect(res.status).toBe(404);
        expect(res.body.message).toMatch(/category not found/i);
    });

    test('team_member cannot add furniture (403)', async () => {
        const res = await memberAg.post('/api/furniture/add').send({ name: 'Chair', furnitureCategoryId: catId });
        expect(res.status).toBe(403);
    });
});

// ── Delete Furniture Item ──────────────────────────────────────────────────────

describe('DELETE /api/furniture/:id', () => {
    let catId;
    let furnitureId;

    beforeAll(async () => {
        const catRes = await mainAg.post('/api/furniture/categories/add').send({ name: 'Wardrobes' });
        catId = catRes.body.id;
        const itemRes = await mainAg.post('/api/furniture/add').send({ name: 'Sliding Wardrobe', furnitureCategoryId: catId });
        furnitureId = itemRes.body.id;
    });

    test('main user can delete a furniture item', async () => {
        const res = await mainAg.delete(`/api/furniture/${furnitureId}`);
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/deleted/i);
    });

    test('returns 404 when item does not exist', async () => {
        const res = await mainAg.delete('/api/furniture/99999');
        expect(res.status).toBe(404);
    });

    test('team_member cannot delete furniture (403)', async () => {
        // Create another piece of furniture
        const itemRes = await mainAg.post('/api/furniture/add').send({ name: 'Bookshelf', furnitureCategoryId: catId });
        const res = await memberAg.delete(`/api/furniture/${itemRes.body.id}`);
        expect(res.status).toBe(403);
    });
});
