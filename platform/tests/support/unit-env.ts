// Feste, ungefährliche Testwerte – keine echten Geheimnisse.
process.env.APP_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL ??= "postgres://unused-in-unit-tests";
process.env.AUTH_SECRET = "unit-test-secret-unit-test-secret-0000";
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.TEST_MODE = "true";
