# Interior Design App with AI Style Transfer

A powerful, AI-driven professional platform for interior designers and architects. This application leverages Google Gemini AI to transform room layouts, apply complex styles, and surgically insert furniture into existing spaces.

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![React](https://img.shields.io/badge/React-19-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-cyan)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)

## Core Features

### AI Image Generation & Style Transfer
- **Architectural Preservation**: Use a source image as a layout guide. The AI preserves the exact spatial geometry and structural outlines while applying a new design.
- **Multi-Style Control**:
    - **Predefined Styles**: Choose from a curated bank of interior design styles (Modern, Industrial, Scandi, etc.).
    - **Style Reference Images**: Upload one or more images to serve as a visual "mood board" for the AI to emulate.
    - **Custom Style Prompting**: Fine-tune results with specific text descriptions.
- **High Resolution Support**: Generate images in Standard, 2K, or 4K quality (integrated with a credit system).

### 🪑 Surgical Furniture Inpainting
- **Smart Masking**: Select a specific area of a room to modify.
- **Reference Furniture**: Upload images of real furniture pieces. The AI "inpaints" these specific objects into the masked area, matching the perspective, lighting, and shadows of the original room.

### Team & Resource Management
- **Main User & Sub-Users**: Organizations can have a "Main User" who manages a team of designers.
- **Location Management**: Organize team members and projects by physical locations/offices.
- **Credit System**: Distribute and transfer generation credits among team members.
- **Email Notifications**: Automatic onboarding and update emails via Nodemailer.

### Content Management
- **Furniture Catalogs**: Build a centralized library of furniture with multiple reference images per item.
- **Style Banks**: Create custom design style categories with visual references for the entire team to use.
- **Project Hierarchy**: Organize generations into Categories and Projects.

### Global & Secure
- **Localization**: Fully internationalized UI (i18next) supporting multiple languages.
- **Secure Authentication**: Local login and Google OAuth 2.0 integration.
- **Hardware-Accelerated Backend**: Node.js/Express backend with Sequelize (SQLite) for robust data management.

---

## Getting Started

### Prerequisites
- **Node.js**: v18 or higher.
- **Google Gemini API Key**: Required for AI generations.
- **Gmail Account**: Required for sending automated emails (using App Passwords).

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-repo/interior-design-app.git
   cd interior-design-app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Setup**:
   Create a `.env` file in the root directory and fill in the following:
   ```env
   # Server Config
   PORT=3000
   SESSION_SECRET=your_super_secret_key
   APP_URL=http://localhost:3000

   # AI Configuration
   GEMINI_API_KEY=your_google_gemini_api_key

   # Authentication
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret

   # Email (Nodemailer)
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password

   # Database (Optional adjustment)
   # DB_STORAGE=./database.sqlite
   ```

4. **Initialize Database**:
   ```bash
   node migrate.js
   ```

5. **Run the Application**:
   ```bash
   # Build the frontend
   npm run build

   # Start the server
   npm start
   ```

6. **Development Mode**:
   ```bash
   # Run Vite development server
   npm run dev
   ```

---

## Tech Stack

- **Frontend**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), [React Router 7](https://reactrouter.com/).
- **Backend**: [Express.js](https://expressjs.com/), [Passport.js](https://www.passportjs.org/) (Local & Google OAuth), [Sequelize](https://sequelize.org/) (SQLite).
- **AI**: [Google Generative AI](https://ai.google.dev/) (Gemini 2.5 Flash / Pro).
- **Storage**: [Multer](https://github.com/expressjs/multer) for local file management.
- **i18n**: [i18next](https://www.i18next.com/) for multi-language support.
- **Testing**: [Jest](https://jestjs.io/) + [Supertest](https://github.com/ladjs/supertest) with in-memory SQLite.

---

## Project Structure

```text
├── config/             # Passport and DB initialization
├── models/             # Sequelize models (User, Project, Furniture, etc.)
├── routes/             # API endpoints (Auth, AI, Team, Styles)
├── src/                # React components and pages
├── public/             # Static assets
├── private/uploads/    # Secure storage for user images
├── tests/              # Automated test suites (Jest + Supertest)
│   ├── helpers/        # Shared test app factory (in-memory DB)
│   ├── auth.test.js
│   ├── credits.test.js
│   ├── team.test.js
│   ├── projects.test.js
│   └── furniture.test.js
├── server.js           # Main Express entry point
├── vite.config.js      # Frontend build configuration
└── tailwind.config.js  # Styling configuration
```

---

## Testing

The project includes an automated integration test suite covering all core API routes.

### Run Tests

```bash
npm test
```

Tests run against an **in-memory SQLite database** — no production data is touched and no running server is required.

### Test Coverage

| Suite | File | Description |
|---|---|---|
| Auth | `tests/auth.test.js` | Signup, login, logout, `/me`, change-password |
| Credits | `tests/credits.test.js` | Balance fetch, credit purchase, role/auth guards |
| Team | `tests/team.test.js` | Add/delete members, credit transfer between users |
| Projects | `tests/projects.test.js` | Category & project CRUD, duplicate detection, ownership |
| Furniture | `tests/furniture.test.js` | Category/item CRUD, image limits, role guards |

**56 tests** across 5 suites — all passing (~11 s).

### Key Scenarios Tested

- **Auth guards** — every protected route returns `401` for unauthenticated requests
- **Role guards** — `team_member` users get `403` on admin-only operations
- **Ownership enforcement** — users cannot access or delete resources belonging to another user
- **Duplicate prevention** — duplicate emails, category names, and project names are rejected with `400`
- **Credit edge cases** — zero, negative, non-numeric amounts; transfers exceeding balance
- **Password change** — wrong current password blocked; new password verified by re-login

### Stack

- **[Jest](https://jestjs.io/)** — test runner
- **[Supertest](https://github.com/ladjs/supertest)** — HTTP assertion library
- **[Sequelize in-memory SQLite](https://sequelize.org/)** — isolated test database

---

## License
This project is licensed under the **ISC License**. See the `LICENSE` file for details.

---

## Contributing
1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.
