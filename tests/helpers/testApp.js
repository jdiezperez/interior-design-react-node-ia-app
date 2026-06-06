/**
 * tests/helpers/testApp.js
 *
 * Builds a standalone Express app wired to an in-memory SQLite database.
 * All modules are required fresh so mocking works cleanly with Jest.
 *
 * Usage in test files:
 *   const { buildApp, db } = require('./helpers/testApp');
 */

process.env.NODE_ENV = 'test';
// Point to an in-memory SQLite file so we never touch the real DB
process.env.DB_STORAGE = ':memory:';

const express = require('express');
const session = require('express-session');
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const path = require('path');

// ── In-Memory Database ────────────────────────────────────────────────────────
const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });

// ── Model Definitions (inline, no file I/O dependencies) ─────────────────────

const User = db.define('User', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: true },
    googleId: { type: DataTypes.STRING, allowNull: true },
    resetToken: { type: DataTypes.STRING, allowNull: true },
    resetTokenExpiry: { type: DataTypes.DATE, allowNull: true },
    parentId: { type: DataTypes.INTEGER, allowNull: true },
    locationId: { type: DataTypes.INTEGER, allowNull: true },
    role: { type: DataTypes.STRING, defaultValue: 'main_user' },
    credits: { type: DataTypes.FLOAT, defaultValue: 0 },
}, {
    hooks: {
        beforeCreate: async (user) => {
            if (user.password) {
                user.password = await bcrypt.hash(user.password, 10);
            }
        },
        beforeUpdate: async (user) => {
            if (user.changed('password')) {
                user.password = await bcrypt.hash(user.password, 10);
            }
        }
    }
});

User.prototype.validPassword = async function (pw) {
    return bcrypt.compare(pw, this.password);
};

const Location = db.define('Location', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
});

const ProjectCategory = db.define('ProjectCategory', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
});

const Project = db.define('Project', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    projectCategoryId: { type: DataTypes.INTEGER, allowNull: false },
});

const ProjectImage = db.define('ProjectImage', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    filename: { type: DataTypes.STRING, allowNull: false },
    projectId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
});

const FurnitureCategory = db.define('FurnitureCategory', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
});

const Furniture = db.define('Furniture', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    furnitureCategoryId: { type: DataTypes.INTEGER, allowNull: false },
});

const FurnitureImage = db.define('FurnitureImage', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    filename: { type: DataTypes.STRING, allowNull: false },
    furnitureId: { type: DataTypes.INTEGER, allowNull: false },
});

// ── Associations ──────────────────────────────────────────────────────────────
Location.hasMany(User, { foreignKey: 'locationId', as: 'members' });
User.belongsTo(Location, { foreignKey: 'locationId', as: 'location' });

ProjectCategory.hasMany(Project, { foreignKey: 'projectCategoryId', as: 'projects' });
Project.belongsTo(ProjectCategory, { foreignKey: 'projectCategoryId', as: 'category' });
Project.hasMany(ProjectImage, { foreignKey: 'projectId', as: 'images' });
ProjectImage.belongsTo(Project, { foreignKey: 'projectId' });

FurnitureCategory.hasMany(Furniture, { foreignKey: 'furnitureCategoryId', as: 'furnitures' });
Furniture.belongsTo(FurnitureCategory, { foreignKey: 'furnitureCategoryId', as: 'category' });
Furniture.hasMany(FurnitureImage, { foreignKey: 'furnitureId', as: 'images' });
FurnitureImage.belongsTo(Furniture, { foreignKey: 'furnitureId', as: 'furniture' });

// ── Passport (Local) ──────────────────────────────────────────────────────────
passport.use('local', new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
        const user = await User.findOne({ where: { email } });
        if (!user) return done(null, false, { message: 'No user with that email' });
        if (!await user.validPassword(password)) return done(null, false, { message: 'Incorrect password' });
        return done(null, user);
    } catch (e) { return done(e); }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try { done(null, await User.findByPk(id)); }
    catch (e) { done(e); }
});

// ── App Factory ───────────────────────────────────────────────────────────────

/**
 * Builds routes inline so they use `db` models above instead of the file-level DB.
 */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
    app.use(passport.initialize());
    app.use(passport.session());

    const isAuthenticated = (req, res, next) =>
        req.isAuthenticated() ? next() : res.status(401).json({ message: 'Not authenticated' });

    const isMainUser = (req, res, next) =>
        (req.user && req.user.role === 'main_user') ? next() :
            res.status(403).json({ message: 'Access denied. Only main users can manage teams.' });

    // ── Auth Routes ────────────────────────────────────────────────────────────
    const authRouter = express.Router();

    authRouter.post('/signup', async (req, res) => {
        try {
            const { name, email, password } = req.body;
            const existing = await User.findOne({ where: { email } });
            if (existing) return res.status(400).json({ message: 'Email already registered' });
            const user = await User.create({ name, email, password });
            req.login(user, (err) => {
                if (err) return res.status(500).json({ message: 'Error logging in after signup' });
                return res.json({ message: 'Signup successful' });
            });
        } catch (err) {
            res.status(500).json({ message: 'Server error' });
        }
    });

    authRouter.post('/login', (req, res, next) => {
        passport.authenticate('local', (err, user, info) => {
            if (err) return next(err);
            if (!user) return res.status(400).json({ message: info.message });
            req.logIn(user, (err) => {
                if (err) return next(err);
                return res.json({ message: 'Login successful' });
            });
        })(req, res, next);
    });

    authRouter.get('/logout', (req, res) => {
        req.logout((err) => { res.json({ message: 'Logged out' }); });
    });

    authRouter.get('/me', (req, res) => {
        if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
        const u = req.user;
        res.json({ id: u.id, name: u.name, email: u.email, role: u.role, credits: u.credits, parentId: u.parentId });
    });

    authRouter.post('/change-password', async (req, res) => {
        if (!req.isAuthenticated()) return res.status(401).json({ message: 'Not authenticated' });
        try {
            const { currentPassword, newPassword } = req.body;
            const user = await User.findByPk(req.user.id);
            const ok = await user.validPassword(currentPassword);
            if (!ok) return res.status(400).json({ message: 'Incorrect current password' });
            user.password = newPassword;
            await user.save();
            res.json({ message: 'Password changed successfully' });
        } catch (e) { res.status(500).json({ message: 'Server error' }); }
    });

    app.use('/auth', authRouter);

    // ── Credits Routes ─────────────────────────────────────────────────────────
    const creditsRouter = express.Router();

    creditsRouter.get('/', isMainUser, async (req, res) => {
        const user = await User.findByPk(req.user.id, { attributes: ['id', 'name', 'email', 'credits'] });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ credits: user.credits });
    });

    creditsRouter.post('/purchase', isMainUser, async (req, res) => {
        const amount = parseFloat(req.body.amount);
        if (isNaN(amount) || amount <= 0) return res.status(400).json({ message: 'Invalid amount. Please enter a positive number.' });
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.credits += amount;
        await user.save();
        res.json({ message: 'Credits purchased successfully!', credits: user.credits });
    });

    app.use('/api/credits', isAuthenticated, creditsRouter);

    // ── Team Routes ────────────────────────────────────────────────────────────
    const teamRouter = express.Router();

    teamRouter.post('/members/add', isMainUser, async (req, res) => {
        try {
            const { name, email, locationId, password } = req.body;
            const existing = await User.findOne({ where: { email } });
            if (existing) return res.status(400).json({ message: 'Email already registered' });
            const newUser = await User.create({ name, email, password, locationId, role: 'team_member', parentId: req.user.id });
            res.json(newUser);
        } catch (e) { res.status(500).json({ message: 'Server error' }); }
    });

    teamRouter.delete('/members/:id', isMainUser, async (req, res) => {
        try {
            const member = await User.findOne({ where: { id: req.params.id, parentId: req.user.id } });
            if (!member) return res.status(404).json({ message: 'Member not found' });
            await member.destroy();
            res.json({ message: 'Member removed' });
        } catch (e) { res.status(500).json({ message: 'Server error' }); }
    });

    teamRouter.post('/credits/transfer', isMainUser, async (req, res) => {
        try {
            const { targetUserId, amount } = req.body;
            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount === 0) return res.status(400).json({ message: 'Invalid amount' });
            const mainUser = await User.findByPk(req.user.id);
            const member = await User.findOne({ where: { id: targetUserId, parentId: req.user.id } });
            if (!member) return res.status(404).json({ message: 'Member not found' });
            if (parsedAmount > 0 && mainUser.credits < parsedAmount) return res.status(400).json({ message: 'Insufficient credits' });
            if (parsedAmount < 0 && member.credits < Math.abs(parsedAmount)) return res.status(400).json({ message: 'Member has insufficient credits' });
            mainUser.credits -= parsedAmount;
            member.credits += parsedAmount;
            await mainUser.save();
            await member.save();
            res.json({ message: 'Credits transferred', mainUserCredits: mainUser.credits, memberCredits: member.credits });
        } catch (e) { res.status(500).json({ message: 'Server error' }); }
    });

    app.use('/api/team', isAuthenticated, teamRouter);

    // ── Projects Routes ────────────────────────────────────────────────────────
    const projectsRouter = express.Router();

    projectsRouter.post('/categories/add', async (req, res) => {
        try {
            const { name } = req.body;
            if (!name) return res.status(400).json({ message: 'Name is required' });
            const existing = await ProjectCategory.findOne({ where: { name, userId: req.user.id } });
            if (existing) return res.status(400).json({ message: 'Category already exists' });
            const cat = await ProjectCategory.create({ name, userId: req.user.id });
            res.json(cat);
        } catch (e) { res.status(500).json({ message: 'Server error' }); }
    });

    projectsRouter.post('/add', async (req, res) => {
        try {
            const { name, projectCategoryId } = req.body;
            if (!name || !projectCategoryId) return res.status(400).json({ message: 'Missing fields' });
            const existing = await Project.findOne({ where: { name, userId: req.user.id } });
            if (existing) return res.status(400).json({ message: 'Project name already exists' });
            const project = await Project.create({ name, projectCategoryId, userId: req.user.id });
            res.json(project);
        } catch (e) { res.status(500).json({ message: 'Server error' }); }
    });

    projectsRouter.delete('/:id', async (req, res) => {
        try {
            const project = await Project.findOne({ where: { id: req.params.id, userId: req.user.id }, include: [{ model: ProjectImage, as: 'images' }] });
            if (!project) return res.status(404).json({ message: 'Not found' });
            await project.destroy();
            res.json({ message: 'Project and associated images deleted' });
        } catch (e) { res.status(500).json({ message: 'Server error' }); }
    });

    app.use('/api/projects', isAuthenticated, projectsRouter);

    // ── Furniture Routes ───────────────────────────────────────────────────────
    const furnitureRouter = express.Router();

    furnitureRouter.get('/categories', async (req, res) => {
        try {
            const ownerId = req.user.parentId ? req.user.parentId : req.user.id;
            const cats = await FurnitureCategory.findAll({
                where: { userId: ownerId },
                include: [{ model: Furniture, as: 'furnitures', include: [{ model: FurnitureImage, as: 'images' }] }],
            });
            res.json(cats);
        } catch (e) { res.status(500).json({ message: 'Server error' }); }
    });

    furnitureRouter.post('/categories/add', isMainUser, async (req, res) => {
        try {
            const { name } = req.body;
            if (!name) return res.status(400).json({ message: 'Name is required' });
            const cat = await FurnitureCategory.create({ name, userId: req.user.id });
            res.json(cat);
        } catch (e) { res.status(500).json({ message: 'Server error' }); }
    });

    furnitureRouter.post('/add', isMainUser, async (req, res) => {
        try {
            const { name, furnitureCategoryId } = req.body;
            const cat = await FurnitureCategory.findOne({ where: { id: furnitureCategoryId, userId: req.user.id } });
            if (!cat) return res.status(404).json({ message: 'Category not found' });
            const item = await Furniture.create({ name, furnitureCategoryId });
            res.json(item);
        } catch (e) { res.status(500).json({ message: 'Server error' }); }
    });

    furnitureRouter.delete('/:id', isMainUser, async (req, res) => {
        try {
            const item = await Furniture.findByPk(req.params.id, {
                include: [{ model: FurnitureCategory, as: 'category', where: { userId: req.user.id } }, { model: FurnitureImage, as: 'images' }]
            });
            if (!item) return res.status(404).json({ message: 'Not found' });
            await item.destroy();
            res.json({ message: 'Furniture and images deleted' });
        } catch (e) { res.status(500).json({ message: 'Server error' }); }
    });

    app.use('/api/furniture', isAuthenticated, furnitureRouter);

    return app;
}

module.exports = { buildApp, db, User, Location, ProjectCategory, Project, ProjectImage, FurnitureCategory, Furniture, FurnitureImage };
