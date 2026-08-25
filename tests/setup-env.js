process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-value';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-password';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:5173';
process.env.API_URL = process.env.API_URL || 'http://127.0.0.1:3000';
// Always a dedicated database so tests never drop your local mcpcontroller data.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/mcpcontroller_test';
