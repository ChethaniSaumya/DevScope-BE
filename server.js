{
  "name": "devscope-backend",
  "version": "1.0.0",
  "description": "DevScope token sniping backend service",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "build": "npx playwright install chromium",
    "postinstall": "npx playwright install chromium",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [
    "solana",
    "token",
    "sniping",
    "pumpfun",
    "letsbonk",
    "twitter",
    "community",
    "scraping"
  ],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "@solana/web3.js": "^1.95.3",
    "bs58": "^5.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "firebase-admin": "^13.4.0",
    "multer": "^2.0.2",
    "node-fetch": "^3.3.2",
    "playwright": "^1.54.2",
    "user-agents": "^1.1.632",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.4"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
