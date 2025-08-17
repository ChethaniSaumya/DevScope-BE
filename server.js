// ========== COMPLETE FIXED SERVER.JS WITH FIREBASE ADMIN LISTS ==========

const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
// Add these imports at the top with other requires
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const { chromium } = require('playwright');
const UserAgent = require('user-agents');

dotenv.config();

// Initialize Firebase Admin SDK
// Initialize Firebase Admin SDK from environment variables
const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://devscope-cad93-default-rtdb.firebaseio.com"
});

const db = admin.firestore();

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3001;
const HELIUS_RPC = process.env.HELIUS_RPC || "https://mainnet.helius-rpc.com/?api-key=82e3e020-5346-402d-a9ec-ab6e0bc4a5e9";
const PUMP_PORTAL_API_KEY = process.env.PUMP_PORTAL_API_KEY;

// ADD THIS TWITTER CONFIG
const TWITTER_CONFIG = {
    username: process.env.TWITTER_USERNAME,
    password: process.env.TWITTER_PASSWORD,
    sessionDir: './session',
    cookiesPath: './session/twitter-cookies.json',
    sessionDurationHours: 24,
    timeouts: {
        navigation: 30000,
        selector: 10000,
        action: 5000
    }
};

const connection = new Connection(HELIUS_RPC, {
    commitment: 'processed',
    confirmTransactionInitialTimeout: 30000,
});

const DEMO_TOKEN_TEMPLATES = [
    {
        name: "Macaroni Mouse",
        symbol: "MACARONI",
        uri: "https://eu-dev.uxento.io/data/cmdvcbd2n00jghb190aiy0y8r",
        pool: "bonk",
        platform: "letsbonk",
        twitterHandle: "Rainmaker1973"
    },
    {
        name: "BuuCoin",
        symbol: "MAJINBUU",
        uri: "https://ipfs.io/ipfs/QmTGkzD267qcG32NvyAhxgijxvhtsbRaPUx7WJMNHZDY35",
        pool: "pump",
        platform: "pumpfun",
        twitterHandle: "CryptoMajin"
    },
    {
        name: "Doge Supreme",
        symbol: "DSUP",
        uri: "https://ipfs.io/ipfs/QmSampleDogeImage123",
        pool: "pump",
        platform: "pumpfun",
        twitterHandle: "DogeSupremeTeam"
    },
    {
        name: "Moon Cat",
        symbol: "MCAT",
        uri: "https://ipfs.io/ipfs/QmSampleCatImage456",
        pool: "bonk",
        platform: "letsbonk",
        twitterHandle: "MoonCatOfficial"
    }
];

// Demo wallet addresses for testing
const DEMO_WALLETS = [
    "HaSdFi2wKLTguxuh4PMBgZuAscbMGEF8XnMHgD5vUeGr",
    "HJdauMU7e8tmM7NFDjV9BSoVzZobVS88wnp3TDAfjuE",
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
    "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
];

// ========== FIREBASE HELPER FUNCTIONS ==========

async function saveAdminListToFirebase(listType, adminData) {
    try {
        console.log(`🔥 Saving ${listType} to Firebase:`, adminData);

        const docRef = db.collection(listType).doc(adminData.id);
        await docRef.set({
            ...adminData,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ SUCCESS: ${listType} entry ${adminData.id} saved to Firebase`);
        return true;
    } catch (error) {
        console.error(`❌ ERROR saving ${listType} to Firebase:`, error);
        return false;
    }
}

async function loadAdminListFromFirebase(listType) {
    try {
        console.log(`📥 Loading ${listType} from Firebase`);

        const snapshot = await db.collection(listType).orderBy('createdAt', 'desc').get();
        const adminList = [];

        snapshot.forEach(doc => {
            adminList.push({
                id: doc.id,
                ...doc.data()
            });
        });

        console.log(`✅ Loaded ${adminList.length} entries from Firebase ${listType}`);
        return adminList;
    } catch (error) {
        console.error(`❌ ERROR loading ${listType} from Firebase:`, error);
        return [];
    }
}

async function deleteAdminFromFirebase(listType, adminId) {
    try {
        console.log(`🗑️ Deleting ${adminId} from Firebase ${listType}`);

        await db.collection(listType).doc(adminId).delete();

        console.log(`✅ SUCCESS: ${adminId} deleted from Firebase ${listType}`);
        return true;
    } catch (error) {
        console.error(`❌ ERROR deleting ${adminId} from Firebase ${listType}:`, error);
        return false;
    }
}

const SOUNDS_DIR = path.join(__dirname, 'uploads', 'sounds');

// Ensure sounds directory exists
async function ensureSoundsDir() {
    try {
        await fs.mkdir(SOUNDS_DIR, { recursive: true });
        console.log('📁 Sounds directory created/verified');
    } catch (error) {
        console.error('Error creating sounds directory:', error);
    }
}

// Configure multer for sound uploads
const soundStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        await ensureSoundsDir();
        cb(null, SOUNDS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `sound-${uniqueSuffix}${ext}`);
    }
});

const uploadSound = multer({
    storage: soundStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'audio/wav', 'audio/wave', 'audio/x-wav',
            'audio/mpeg', 'audio/mp3',
            'audio/ogg', 'audio/vorbis',
            'audio/mp4', 'audio/m4a', 'audio/x-m4a'
        ];

        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only audio files are allowed.'), false);
        }
    }
});

// Helper function to determine MIME type
function getMimeType(ext) {
    const mimeTypes = {
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/m4a'
    };
    return mimeTypes[ext.toLowerCase()] || 'audio/unknown';
}

// ========== ORIGINAL BOTSTATE CLASS ==========

// ADD THIS TWITTER SCRAPER CLASS
// ========== COMPLETE TwitterCommunityAdminScraper CLASS WITH AUTO-HEADLESS ==========

class TwitterCommunityAdminScraper {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.sessionActive = false;
        this.isInitialized = false;
        this.sessionPersistentDataDir = './session/twitter-session';
        this.isHeadless = false; // Track current mode
        this.loginDetectionInterval = null; // For checking login status
    }

    async init() {
        if (this.isInitialized) return true;

        try {
            console.log('🤖 Initializing Twitter scraper...');

            await this.ensureDirectories();
            const userAgent = new UserAgent({ deviceCategory: 'desktop' });

            // Check if we already have a valid session
            const hasValidSession = await this.checkExistingSession();

            if (hasValidSession) {
                console.log('✅ Valid session found - starting in HEADLESS mode');
                this.isHeadless = true;
            } else {
                console.log('⚠️ No valid session - starting in VISIBLE mode for login');
                this.isHeadless = false;
            }

            // Launch browser with appropriate mode
            this.browser = await chromium.launchPersistentContext(this.sessionPersistentDataDir, {
                headless: this.isHeadless, // Dynamic headless mode
                userAgent: userAgent.toString(),
                viewport: { width: 1366, height: 768 },
                args: [
                    '--no-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-extensions',
                    '--no-first-run',
                    '--disable-default-apps'
                ]
            });

            const pages = this.browser.pages();
            this.page = pages[0] || await this.browser.newPage();

            this.isInitialized = true;

            if (this.isHeadless) {
                console.log('✅ Twitter scraper initialized in HEADLESS mode - ready to scrape');
                this.sessionActive = true;
            } else {
                console.log('👁️ Twitter scraper initialized in VISIBLE mode - please login manually');
                console.log('🔗 Opening Twitter login page...');
                await this.page.goto('https://twitter.com/login');

                // Start monitoring for successful login
                this.startLoginDetection();
            }

            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Twitter scraper:', error);
            return false;
        }
    }

    // Check if we have existing valid session data
    async checkExistingSession() {
        try {
            const fs = require('fs').promises;

            // Check if session directory exists and has data
            const sessionDir = this.sessionPersistentDataDir;

            try {
                const files = await fs.readdir(sessionDir);
                const hasSessionFiles = files.some(file =>
                    file.includes('cookies') ||
                    file.includes('localStorage') ||
                    file.includes('sessionStorage') ||
                    file.includes('Local Storage')
                );

                if (hasSessionFiles) {
                    console.log('🔍 Found existing session files');
                    return true;
                }
            } catch (dirError) {
                console.log('📁 No existing session directory found');
            }

            return false;
        } catch (error) {
            console.error('❌ Error checking existing session:', error);
            return false;
        }
    }

    async logout() {
    if (!this.page) {
        console.log('❌ Browser not initialized, cannot logout');
        return false;
    }

    try {
        console.log('🔓 Starting Twitter logout process...');

        // Method 1: Try direct logout URL (most reliable)
        try {
            await this.page.goto('https://twitter.com/logout', { waitUntil: 'networkidle' });
            await this.page.waitForTimeout(2000);

            // Confirm logout if confirmation dialog appears
            const confirmButton = await this.page.$('[data-testid="confirmationSheetConfirm"]');
            if (confirmButton) {
                await confirmButton.click();
                console.log('✅ Confirmed logout');
                await this.page.waitForTimeout(2000);
            }
        } catch (e) {
            console.log('⚠️ Direct logout URL failed, trying alternative method...');
        }

        // Method 2: Try More menu logout (fallback)
        try {
            // Navigate to home first
            await this.page.goto('https://twitter.com/home');
            await this.page.waitForTimeout(2000);

            // Click on "More" menu
            const moreButton = await this.page.waitForSelector('[data-testid="AppTabBar_More_Menu"]', { timeout: 5000 });
            if (moreButton) {
                await moreButton.click();
                await this.page.waitForTimeout(1000);

                // Look for logout option
                const logoutOption = await this.page.waitForSelector('[data-testid="accountSwitcher"] >> text="Log out"', { timeout: 3000 });
                if (logoutOption) {
                    await logoutOption.click();
                    console.log('✅ Clicked logout from More menu');
                    await this.page.waitForTimeout(2000);
                }
            }
        } catch (e) {
            console.log('⚠️ More menu logout not found');
        }

        // Wait for logout to complete
        await this.page.waitForTimeout(3000);

        // Verify logout by checking current URL
        const currentUrl = this.page.url();
        console.log('🔍 Current URL after logout attempt:', currentUrl);

        if (currentUrl.includes('login') || currentUrl.includes('logout') || 
            currentUrl === 'https://twitter.com/' || currentUrl === 'https://x.com/') {
            console.log('✅ Successfully logged out from Twitter');
            this.sessionActive = false;
            
            // Broadcast logout success
            broadcastToClients({
                type: 'twitter_logout_success',
                data: {
                    success: true,
                    message: 'Successfully logged out from Twitter',
                    timestamp: new Date().toISOString()
                }
            });
            
            return true;
        } else {
            console.log('⚠️ Logout may not have completed, current URL:', currentUrl);
            
            // Still mark as logged out locally
            this.sessionActive = false;
            
            broadcastToClients({
                type: 'twitter_logout_partial',
                data: {
                    success: true,
                    message: 'Logout attempted - session marked as inactive',
                    timestamp: new Date().toISOString()
                }
            });
            
            return true; // Consider it successful since we tried
        }

    } catch (error) {
        console.error('❌ Error during Twitter logout:', error);
        
        // Mark as logged out even if error occurred
        this.sessionActive = false;
        
        broadcastToClients({
            type: 'twitter_logout_error',
            data: {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            }
        });
        
        return false;
    }
}

    // Start monitoring for successful login
    startLoginDetection() {
        console.log('👀 Starting login detection monitoring...');

        this.loginDetectionInterval = setInterval(async () => {
            try {
                const isLoggedIn = await this.checkIfLoggedIn();

                if (isLoggedIn) {
                    console.log('🎉 LOGIN DETECTED! Switching to headless mode...');
                    clearInterval(this.loginDetectionInterval);
                    this.loginDetectionInterval = null;

                    // Switch to headless mode
                    await this.switchToHeadlessMode();
                }
            } catch (error) {
                console.error('❌ Error during login detection:', error);
            }
        }, 3000); // Check every 3 seconds
    }

    // Check if user is logged in
    async checkIfLoggedIn() {
        try {
            const currentUrl = this.page.url();
            console.log(`🔍 Login check - Current URL: ${currentUrl}`);

            // Check URL indicators
            if (currentUrl.includes('home') ||
                currentUrl.includes('timeline') ||
                (currentUrl.includes('twitter.com') && !currentUrl.includes('login'))) {
                console.log('✅ URL indicates login success');
                return true;
            }

            // Check for logged-in elements
            const loggedInSelectors = [
                '[data-testid="SideNav_NewTweet_Button"]',
                '[aria-label="Home timeline"]',
                '[data-testid="AppTabBar_Home_Link"]',
                '[data-testid="primaryColumn"]'
            ];

            for (const selector of loggedInSelectors) {
                try {
                    const element = await this.page.waitForSelector(selector, { timeout: 1000 });
                    if (element) {
                        console.log(`✅ Found logged-in element: ${selector}`);
                        return true;
                    }
                } catch (e) {
                    // Element not found, continue checking
                }
            }

            return false;
        } catch (error) {
            console.error('❌ Error checking login status:', error);
            return false;
        }
    }

    // Switch from visible to headless mode
    async switchToHeadlessMode() {
        try {
            console.log('🔄 SWITCHING TO HEADLESS MODE...');

            // Close the visible browser
            if (this.browser) {
                console.log('🔒 Closing visible browser...');
                await this.browser.close();
            }

            // Wait a moment for session to be saved
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Launch new headless browser with same session
            console.log('🤖 Launching headless browser...');
            const userAgent = new UserAgent({ deviceCategory: 'desktop' });

            this.browser = await chromium.launchPersistentContext(this.sessionPersistentDataDir, {
                headless: true, // NOW HEADLESS
                userAgent: userAgent.toString(),
                viewport: { width: 1366, height: 768 },
                args: [
                    '--no-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-extensions',
                    '--no-first-run',
                    '--disable-default-apps'
                ]
            });

            const pages = this.browser.pages();
            this.page = pages[0] || await this.browser.newPage();

            this.isHeadless = true;
            this.sessionActive = true;

            console.log('✅ SUCCESSFULLY SWITCHED TO HEADLESS MODE');
            console.log('👻 Browser is now invisible and ready for scraping');

            // Verify session works in headless mode
            const sessionCheck = await this.checkSessionStatus();
            if (sessionCheck.loggedIn) {
                console.log('🎯 Headless session verified - ready to scrape communities!');

                // Broadcast success to frontend
                broadcastToClients({
                    type: 'twitter_session_switched_headless',
                    data: {
                        success: true,
                        message: 'Browser switched to headless mode - ready for invisible scraping',
                        mode: 'headless',
                        timestamp: new Date().toISOString()
                    }
                });

            } else {
                console.log('⚠️ Session verification failed in headless mode');

                broadcastToClients({
                    type: 'twitter_session_switch_failed',
                    data: {
                        success: false,
                        message: 'Failed to verify session in headless mode',
                        timestamp: new Date().toISOString()
                    }
                });
            }

        } catch (error) {
            console.error('❌ Failed to switch to headless mode:', error);

            broadcastToClients({
                type: 'twitter_session_switch_error',
                data: {
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }
            });
        }
    }

    async checkSessionStatus() {
        if (!this.page) {
            return { loggedIn: false, error: 'Browser not initialized' };
        }

        try {
            const currentUrl = this.page.url();
            console.log(`🔍 Session check - Current URL: ${currentUrl} (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);

            // Navigate to home to check session (works in both modes)
            try {
                await this.page.goto('https://twitter.com/home', { waitUntil: 'networkidle' });
            } catch (navError) {
                console.log('Navigation error, checking current page...');
            }

            const newUrl = this.page.url();

            // Check for logged-in indicators
            const loggedInIndicators = [
                '[data-testid="SideNav_NewTweet_Button"]',
                '[aria-label="Home timeline"]',
                '[data-testid="AppTabBar_Home_Link"]',
                '[data-testid="primaryColumn"]'
            ];

            for (const indicator of loggedInIndicators) {
                try {
                    const element = await this.page.waitForSelector(indicator, { timeout: 2000 });
                    if (element) {
                        console.log(`✅ Session active (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'}) - found: ${indicator}`);
                        this.sessionActive = true;
                        return { loggedIn: true, url: newUrl, mode: this.isHeadless ? 'headless' : 'visible' };
                    }
                } catch (e) {
                    // Continue checking other indicators
                }
            }

            // Check URL patterns
            if (newUrl.includes('home') || newUrl.includes('timeline') ||
                (newUrl.includes('twitter.com') && !newUrl.includes('login'))) {
                console.log(`✅ Session appears active (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'}) based on URL`);
                this.sessionActive = true;
                return { loggedIn: true, url: newUrl, mode: this.isHeadless ? 'headless' : 'visible' };
            }

            console.log(`❌ Session not active (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);
            this.sessionActive = false;
            return { loggedIn: false, url: newUrl, mode: this.isHeadless ? 'headless' : 'visible' };

        } catch (error) {
            console.error(`❌ Error checking session status (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'}):`, error);
            return { loggedIn: false, error: error.message, mode: this.isHeadless ? 'headless' : 'visible' };
        }
    }

    async scrapeCommunityAdmins(communityId) {
        console.log(`🎯 Scraping admins from community: ${communityId} (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'} MODE)`);

        // Check if session is active first
        const sessionStatus = await this.checkSessionStatus();
        if (!sessionStatus.loggedIn) {
            console.log(`❌ Session not active in ${this.isHeadless ? 'headless' : 'visible'} mode. Login required.`);
            throw new Error(`Twitter session not active. Please login ${this.isHeadless ? 'again' : 'manually'}.`);
        }

        const moderatorsUrl = `https://x.com/i/communities/${communityId}/moderators`;

        try {
            console.log(`🌐 Navigating to: ${moderatorsUrl} (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);
            await this.page.goto(moderatorsUrl);
            await this.page.waitForTimeout(5000);

            // Check if we got redirected to login (session expired)
            const currentUrl = this.page.url();
            if (currentUrl.includes('login')) {
                console.log(`❌ Redirected to login - session expired in ${this.isHeadless ? 'headless' : 'visible'} mode`);
                throw new Error('Session expired. Please login again.');
            }

            // PRIMARY METHOD: Screenshot + Text Analysis
            console.log(`📸 Using screenshot method (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})...`);
            const screenshotAdmins = await this.extractAdminsFromScreenshot(communityId);

            if (screenshotAdmins.length > 0) {
                console.log(`✅ Screenshot method found ${screenshotAdmins.length} admin(s) (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);
                return screenshotAdmins;
            }

            // BACKUP METHOD: DOM Scraping (only if screenshot fails)
            console.log(`⚠️ Screenshot method failed, trying DOM scraping (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})...`);
            const domAdmins = await this.extractAdminsFromDOM();

            console.log(`✅ Found ${domAdmins.length} admin(s) using DOM method (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);
            return domAdmins;

        } catch (error) {
            console.error(`❌ Failed to scrape community ${communityId} in ${this.isHeadless ? 'headless' : 'visible'} mode:`, error);
            return [];
        }
    }

    parseAdminsFromText(pageText) {
        const lines = pageText.split('\n');
        const admins = [];

        console.log(`🔍 Analyzing text for admin patterns (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})...`);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
            const prevLine = i > 0 ? lines[i - 1].trim() : '';

            if (line === 'Admin') {
                if (prevLine && /^[a-zA-Z0-9_]{1,15}$/.test(prevLine)) {
                    admins.push({
                        username: prevLine,
                        badgeType: 'Admin',
                        source: `${this.isHeadless ? 'headless' : 'visible'}_text_analysis`,
                        pattern: 'username_before_admin'
                    });
                    console.log(`👑 Found admin: @${prevLine} (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);
                }
                else if (nextLine && /^[a-zA-Z0-9_]{1,15}$/.test(nextLine)) {
                    admins.push({
                        username: nextLine,
                        badgeType: 'Admin',
                        source: `${this.isHeadless ? 'headless' : 'visible'}_text_analysis`,
                        pattern: 'username_after_admin'
                    });
                    console.log(`👑 Found admin: @${nextLine} (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);
                }
            }
            else if (line === 'Mod') {
                if (prevLine && /^[a-zA-Z0-9_]{1,15}$/.test(prevLine)) {
                    admins.push({
                        username: prevLine,
                        badgeType: 'Mod',
                        source: `${this.isHeadless ? 'headless' : 'visible'}_text_analysis`,
                        pattern: 'username_before_mod'
                    });
                    console.log(`🛡️ Found mod: @${prevLine} (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);
                }
                else if (nextLine && /^[a-zA-Z0-9_]{1,15}$/.test(nextLine)) {
                    admins.push({
                        username: nextLine,
                        badgeType: 'Mod',
                        source: `${this.isHeadless ? 'headless' : 'visible'}_text_analysis`,
                        pattern: 'username_after_mod'
                    });
                    console.log(`🛡️ Found mod: @${nextLine} (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);
                }
            }
            else if (line.startsWith('@')) {
                const username = line.slice(1);
                if (/^[a-zA-Z0-9_]{1,15}$/.test(username)) {
                    let badgeType = 'Member';

                    if (prevLine === 'Admin' || nextLine === 'Admin') {
                        badgeType = 'Admin';
                        console.log(`👑 Found admin: @${username} (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);
                    } else if (prevLine === 'Mod' || nextLine === 'Mod') {
                        badgeType = 'Mod';
                        console.log(`🛡️ Found mod: @${username} (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);
                    }

                    admins.push({
                        username: username,
                        badgeType: badgeType,
                        source: `${this.isHeadless ? 'headless' : 'visible'}_text_analysis`,
                        pattern: '@username_format'
                    });
                }
            }
            else if (/^[a-zA-Z0-9_]{1,15}$/.test(line)) {
                let badgeType = 'Member';
                let pattern = 'standalone_username';

                for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) {
                    if (j !== i) {
                        const nearbyLine = lines[j].trim();
                        if (nearbyLine === 'Admin') {
                            badgeType = 'Admin';
                            pattern = 'username_near_admin';
                            console.log(`👑 Found admin: @${line} (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);
                            break;
                        } else if (nearbyLine === 'Mod') {
                            badgeType = 'Mod';
                            pattern = 'username_near_mod';
                            console.log(`🛡️ Found mod: @${line} (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);
                            break;
                        }
                    }
                }

                if (badgeType !== 'Member') {
                    admins.push({
                        username: line,
                        badgeType: badgeType,
                        source: `${this.isHeadless ? 'headless' : 'visible'}_text_analysis`,
                        pattern: pattern
                    });
                }
            }
        }

        const uniqueAdmins = admins.filter((admin, index, self) =>
            index === self.findIndex(a => a.username === admin.username)
        ).sort((a, b) => {
            if (a.badgeType === 'Admin' && b.badgeType === 'Mod') return -1;
            if (a.badgeType === 'Mod' && b.badgeType === 'Admin') return 1;
            return 0;
        });

        console.log(`🎯 Final unique admins found (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'}): ${uniqueAdmins.length}`);
        return uniqueAdmins;
    }

    async extractAdminsFromScreenshot(communityId) {
        console.log(`📸 Taking screenshot and analyzing text (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})...`);

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const screenshotFileName = `community_${communityId}_${this.isHeadless ? 'headless' : 'visible'}_${timestamp}.png`;
            const screenshotPath = `./output/${screenshotFileName}`;

            await this.ensureOutputDirectory();

            await this.page.screenshot({
                path: screenshotPath,
                fullPage: true,
                type: 'png'
            });

            console.log(`📸 Screenshot saved (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'}): ${screenshotPath}`);

            const pageText = await this.page.evaluate(() => {
                return document.body.innerText;
            });

            const textFileName = `community_${communityId}_${this.isHeadless ? 'headless' : 'visible'}_text_${timestamp}.txt`;
            const textPath = `./output/${textFileName}`;
            await this.saveTextFile(textPath, pageText);

            const admins = this.parseAdminsFromText(pageText);

            console.log(`🔍 Text analysis found ${admins.length} admin(s) (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})`);

            return admins;

        } catch (error) {
            console.error(`❌ Screenshot method failed (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'}):`, error);
            return [];
        }
    }

    async extractAdminsFromDOM() {
        console.log(`🔧 Using DOM scraping (${this.isHeadless ? 'HEADLESS' : 'VISIBLE'})...`);

        return await this.page.evaluate(() => {
            const userCells = document.querySelectorAll('div[data-testid="UserCell"]');
            const adminData = [];

            userCells.forEach((cell) => {
                const usernameLink = cell.querySelector('a[href^="/"]');

                if (usernameLink) {
                    const username = usernameLink.getAttribute('href').slice(1);

                    const adminBadge = Array.from(cell.querySelectorAll('*')).find(el =>
                        el.textContent && el.textContent.trim() === 'Admin'
                    );

                    const modBadge = Array.from(cell.querySelectorAll('*')).find(el =>
                        el.textContent && el.textContent.trim() === 'Mod'
                    );

                    let badgeType = 'Member';
                    if (adminBadge) {
                        badgeType = 'Admin';
                    } else if (modBadge) {
                        badgeType = 'Mod';
                    }

                    adminData.push({
                        username: username,
                        badgeType: badgeType,
                        source: 'dom_scraping',
                        pattern: 'html_element'
                    });
                }
            });

            return adminData;
        });
    }

    async close() {
        // Clear login detection interval
        if (this.loginDetectionInterval) {
            clearInterval(this.loginDetectionInterval);
            this.loginDetectionInterval = null;
            console.log('🔄 Login detection monitoring stopped');
        }

        if (this.browser) {
            await this.browser.close();
            this.isInitialized = false;
            console.log(`✅ Browser closed (was in ${this.isHeadless ? 'HEADLESS' : 'VISIBLE'} mode)`);
        }
    }

    async ensureDirectories() {
        const fs = require('fs').promises;

        try {
            await fs.access('./session');
        } catch {
            await fs.mkdir('./session', { recursive: true });
        }

        try {
            await fs.access(this.sessionPersistentDataDir);
        } catch {
            await fs.mkdir(this.sessionPersistentDataDir, { recursive: true });
        }
    }

    async ensureOutputDirectory() {
        const fs = require('fs').promises;

        try {
            await fs.access('./output');
        } catch {
            await fs.mkdir('./output', { recursive: true });
            console.log('📁 Created output directory');
        }
    }

    async saveTextFile(filePath, content) {
        const fs = require('fs').promises;

        try {
            await fs.writeFile(filePath, content, 'utf8');
            console.log(`📁 Text saved: ${filePath}`);
        } catch (error) {
            console.error('❌ Failed to save text file:', error);
        }
    }
}

// CREATE GLOBAL SCRAPER INSTANCE
const twitterScraper = new TwitterCommunityAdminScraper();

class BotState {
    constructor() {
        this.isRunning = false;
        this.settings = {
            privateKey: '',
            tokenPageDestination: 'neo_bullx',
            enableAdminFilter: true,
            enableCommunityReuse: true,
            snipeAllTokens: false,
            detectionOnlyMode: true,

            // Global snipe settings
            globalSnipeSettings: {
                amount: 0.01,
                fees: 10,
                mevProtection: true,
                soundNotification: 'default.wav'
            }
        };
        this.primaryAdminList = new Map();
        this.secondaryAdminList = new Map();
        this.usedCommunities = new Set();
        this.processedTokens = new Set();
        this.detectedTokens = new Map();
        this.pumpPortalSocket = null;
        this.letsBonkSocket = null;
        this.reconnectTimeouts = new Map();
    }

    addDetectedToken(tokenAddress, tokenData) {
        this.detectedTokens.set(tokenAddress, {
            ...tokenData,
            detectedAt: new Date().toISOString(),
            id: Date.now().toString()
        });

        if (this.detectedTokens.size > 100) {
            const firstKey = this.detectedTokens.keys().next().value;
            this.detectedTokens.delete(firstKey);
        }
    }

    getDetectedTokens() {
        return Array.from(this.detectedTokens.values()).reverse();
    }

    clearDetectedTokens() {
        this.detectedTokens.clear();
    }

    addToList(listType, entry) {
        const config = {
            id: Date.now().toString(),
            address: (entry.address || entry.username).trim(),
            amount: entry.amount,
            fees: entry.fees,
            mevProtection: entry.mevProtection,
            soundNotification: entry.soundNotification,
            createdAt: new Date().toISOString()
        };

        switch (listType) {
            case 'primary_admins':
                this.primaryAdminList.set(config.id, config);
                break;
            case 'secondary_admins':
                this.secondaryAdminList.set(config.id, config);
                break;
        }
        return config;
    }

    removeFromList(listType, id) {
        switch (listType) {
            case 'primary_admins':
                return this.primaryAdminList.delete(id);
            case 'secondary_admins':
                return this.secondaryAdminList.delete(id);
        }
        return false;
    }

    getList(listType) {
        switch (listType) {
            case 'primary_admins':
                return Array.from(this.primaryAdminList.values());
            case 'secondary_admins':
                return Array.from(this.secondaryAdminList.values());
            default:
                return [];
        }
    }

    checkAdminInPrimary(identifier) {
        if (!identifier) return null;
        const cleanIdentifier = identifier.trim().toLowerCase();

        for (const config of this.primaryAdminList.values()) {
            const cleanAddress = config.address.trim().toLowerCase();
            console.log(`🔍 Comparing "${cleanIdentifier}" with "${cleanAddress}"`);
            if (cleanAddress === cleanIdentifier) {
                console.log(`✅ MATCH FOUND in primary: ${cleanAddress}`);
                return config;
            }
        }
        return null;
    }

    checkAdminInSecondary(identifier) {
        if (!identifier) return null;
        const cleanIdentifier = identifier.trim().toLowerCase();

        for (const config of this.secondaryAdminList.values()) {
            const cleanAddress = config.address.trim().toLowerCase();
            console.log(`🔍 Comparing "${cleanIdentifier}" with "${cleanAddress}"`);
            if (cleanAddress === cleanIdentifier) {
                console.log(`✅ MATCH FOUND in secondary: ${cleanAddress}`);
                return config;
            }
        }
        return null;
    }
}

// ========== ENHANCED BOTSTATE CLASS WITH FIREBASE ==========

class EnhancedBotState extends BotState {
    constructor() {
        super();
        this.isFirebaseLoaded = false;
    }

    // Load admin lists from Firebase on startup
    async loadAdminListsFromFirebase() {
        try {
            console.log('📥 Loading admin lists from Firebase...');

            // Load primary admins
            const primaryAdmins = await loadAdminListFromFirebase('primary_admins');
            this.primaryAdminList.clear();
            primaryAdmins.forEach(admin => {
                this.primaryAdminList.set(admin.id, admin);
            });

            // Load secondary admins  
            const secondaryAdmins = await loadAdminListFromFirebase('secondary_admins');
            this.secondaryAdminList.clear();
            secondaryAdmins.forEach(admin => {
                this.secondaryAdminList.set(admin.id, admin);
            });

            this.isFirebaseLoaded = true;
            console.log(`✅ Firebase admin lists loaded: ${primaryAdmins.length} primary, ${secondaryAdmins.length} secondary`);

            return true;
        } catch (error) {
            console.error('❌ Failed to load admin lists from Firebase:', error);
            this.isFirebaseLoaded = false;
            return false;
        }
    }

    // Enhanced addToList with Firebase sync
    async addToList(listType, entry) {
        const config = {
            id: Date.now().toString(),
            address: (entry.address || entry.username).trim(),
            amount: entry.amount,
            fees: entry.fees,
            mevProtection: entry.mevProtection,
            soundNotification: entry.soundNotification,
            createdAt: new Date().toISOString()
        };

        // Add to local state
        switch (listType) {
            case 'primary_admins':
                this.primaryAdminList.set(config.id, config);
                break;
            case 'secondary_admins':
                this.secondaryAdminList.set(config.id, config);
                break;
        }

        // Save to Firebase
        await saveAdminListToFirebase(listType, config);

        return config;
    }

    // Enhanced removeFromList with Firebase sync
    async removeFromList(listType, id) {
        let success = false;

        // Remove from local state
        switch (listType) {
            case 'primary_admins':
                success = this.primaryAdminList.delete(id);
                break;
            case 'secondary_admins':
                success = this.secondaryAdminList.delete(id);
                break;
        }

        // Delete from Firebase if local deletion was successful
        if (success) {
            await deleteAdminFromFirebase(listType, id);
        }

        return success;
    }

    // Get stats including Firebase status
    getStats() {
        return {
            primaryAdmins: this.primaryAdminList.size,
            secondaryAdmins: this.secondaryAdminList.size,
            usedCommunities: this.usedCommunities.size,
            processedTokens: this.processedTokens.size,
            isFirebaseLoaded: this.isFirebaseLoaded
        };
    }
}

// Create enhanced bot state instance
const botState = new EnhancedBotState();

// WebSocket clients management
const wsClients = new Set();

function broadcastToClients(data) {
    const message = JSON.stringify(data);
    wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// ========== TWITTER DETECTION FUNCTIONS ==========

function extractTwitterData(input) {
    if (!input) return { type: null, id: null, handle: null };

    console.log(`🔍 Extracting Twitter data from: "${input}"`);

    // Clean the input
    const cleanInput = input.trim();

    // Pattern for Twitter community links
    const communityRegex = /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com\/|x\.com\/)i\/communities\/(\d+)/i;
    const communityMatch = cleanInput.match(communityRegex);

    if (communityMatch) {
        console.log(`🏘️ Found community ID: ${communityMatch[1]}`);
        return {
            type: 'community',
            id: communityMatch[1],
            handle: null,
            originalUrl: cleanInput
        };
    }

    // Pattern for individual Twitter accounts (more permissive)
    const userRegex = /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com\/|x\.com\/)(?!i\/communities\/)([a-zA-Z0-9_]+)/i;
    const userMatch = cleanInput.match(userRegex);

    if (userMatch) {
        const handle = userMatch[1].toLowerCase();
        console.log(`👤 Found individual handle: @${handle}`);
        return {
            type: 'individual',
            id: null,
            handle: handle,
            originalUrl: cleanInput
        };
    }

    // If it's just a handle without URL
    if (cleanInput.startsWith('@')) {
        const handle = cleanInput.substring(1).trim().toLowerCase(); // Add .trim()
        console.log(`👤 Found handle without URL: @${handle}`);
        return {
            type: 'individual',
            id: null,
            handle: handle,
            originalUrl: cleanInput
        };
    }

    // If it's just a plain username (be more strict here)
    if (/^[a-zA-Z0-9_]{1,15}$/.test(cleanInput)) {
        const handle = cleanInput.trim().toLowerCase(); // Add .trim()
        console.log(`👤 Found plain username: @${handle}`);
        return {
            type: 'individual',
            id: null,
            handle: handle,
            originalUrl: cleanInput
        };
    }

    console.log(`❌ No Twitter data found in: "${input}"`);
    return { type: null, id: null, handle: null };
}

// Firebase community tracking functions
async function isCommunityUsedInFirebase(communityId) {
    try {
        const docRef = db.collection('usedCommunities').doc(communityId);
        const doc = await docRef.get();
        return doc.exists;
    } catch (error) {
        console.error('Error checking community in Firebase:', error);
        return false; // If error, don't block (safer approach)
    }
}

async function getPairAddressFromDexScreener(tokenAddress) {
    try {
        console.log(`🔍 Fetching pair address for token: ${tokenAddress}`);

        // Use the actual token address, not hardcoded one
        const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;

        const response = await fetch(url, {
            timeout: 10000, // 10 second timeout
            headers: {
                'User-Agent': 'DevScope-Bot/1.0'
            }
        });

        if (!response.ok) {
            console.log(`❌ DexScreener API error: ${response.status}`);
            return null;
        }

        const data = await response.json();
        console.log(`📊 DexScreener response:`, data);

        if (data.pairs && data.pairs.length > 0) {
            // Find Raydium pair first, or fallback to first available pair
            let bestPair = data.pairs.find(pair =>
                pair.dexId === 'raydium' ||
                pair.dexId.toLowerCase().includes('raydium')
            ) || data.pairs[0];

            console.log(`✅ Found pair on ${bestPair.dexId}: ${bestPair.pairAddress}`);

            return {
                pairAddress: bestPair.pairAddress,
                dexId: bestPair.dexId,
                baseToken: bestPair.baseToken,
                quoteToken: bestPair.quoteToken,
                liquidity: bestPair.liquidity,
                url: bestPair.url
            };
        }

        console.log(`❌ No pairs found for token: ${tokenAddress}`);
        return null;
    } catch (error) {
        console.error('❌ Error fetching pair data from DexScreener:', error);
        return null;
    }
}


async function markCommunityAsUsedInFirebase(communityId, tokenData) {
    try {
        console.log(`🔥 Attempting to save community ${communityId} to Firebase`);

        const docRef = db.collection('usedCommunities').doc(communityId);
        await docRef.set({
            communityId: communityId,
            firstUsedAt: admin.firestore.FieldValue.serverTimestamp(),
            tokenAddress: tokenData.tokenAddress,
            tokenName: tokenData.name,
            platform: tokenData.platform,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ SUCCESS: Community ${communityId} saved to Firebase`);
        return true;
    } catch (error) {
        console.error(`❌ ERROR saving community ${communityId} to Firebase:`, error);
        console.error('Full error details:', error.message, error.code);
        return false;
    }
}

// Enhanced getTwitterDataFromToken function
async function getTwitterDataFromToken(tokenData) {
    try {
        let twitterData = { type: null, id: null, handle: null, admin: null };

        // First, try to fetch metadata from URI if available
        let metadata = {};
        if (tokenData.uri) {
            try {
                console.log(`📥 Fetching metadata from: ${tokenData.uri}`);
                const response = await fetch(tokenData.uri, {
                    timeout: 10000, // 10 second timeout
                    headers: {
                        'User-Agent': 'DevScope-Bot/1.0'
                    }
                });

                if (response.ok) {
                    metadata = await response.json();
                    console.log('📄 Metadata fetched:', metadata);
                } else {
                    console.log(`❌ Failed to fetch metadata: ${response.status}`);
                }
            } catch (error) {
                console.error('Failed to fetch metadata from URI:', error);
            }
        }

        // Check various fields where Twitter data might be stored
        const fieldsToCheck = [
            // Demo token metadata field
            tokenData.metadata?.twitter,

            // Direct token data fields
            tokenData.twitter,
            tokenData.social?.twitter,
            tokenData.website,

            // Metadata fields
            metadata.twitter,
            metadata.social?.twitter,
            metadata.website,

            // Social links in metadata
            metadata.external_url,
            metadata.external_link,

            // Description might contain Twitter links
            metadata.description,
            tokenData.description
        ];

        // Check socials array if it exists in token data
        if (tokenData.socials && Array.isArray(tokenData.socials)) {
            for (const social of tokenData.socials) {
                if (social.type === 'twitter' || social.platform === 'twitter') {
                    fieldsToCheck.push(social.url || social.handle);
                }
            }
        }

        // Check socials array if it exists in metadata
        if (metadata.socials && Array.isArray(metadata.socials)) {
            for (const social of metadata.socials) {
                if (social.type === 'twitter' || social.platform === 'twitter') {
                    fieldsToCheck.push(social.url || social.handle);
                }
            }
        }

        // Check attributes array in metadata (common in NFT metadata)
        if (metadata.attributes && Array.isArray(metadata.attributes)) {
            for (const attr of metadata.attributes) {
                if (attr.trait_type === 'twitter' || attr.trait_type === 'Twitter' ||
                    attr.trait_type === 'social' || attr.trait_type === 'Social') {
                    fieldsToCheck.push(attr.value);
                }
            }
        }

        // Extract Twitter data from description if it contains Twitter links
        const descriptionsToCheck = [metadata.description, tokenData.description];
        for (const desc of descriptionsToCheck) {
            if (desc && typeof desc === 'string') {
                const descriptionMatches = desc.match(/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com\/|x\.com\/)[\w\/]+/g);
                if (descriptionMatches) {
                    fieldsToCheck.push(...descriptionMatches);
                }
            }
        }

        console.log('🔍 Fields to check for Twitter data:', fieldsToCheck.filter(f => f));

        // Process each field to find Twitter data
        for (const field of fieldsToCheck) {
            if (field && typeof field === 'string') {
                const extracted = extractTwitterData(field);
                if (extracted.type) {
                    console.log(`✅ Found Twitter data: ${extracted.type} - ${extracted.handle || extracted.id}`);
                    twitterData = extracted;
                    break; // Use the first valid Twitter data found
                }
            }
        }

        // Set admin based on type
        if (twitterData.type === 'individual') {
            twitterData.admin = twitterData.handle;
        } else if (twitterData.type === 'community') {
            twitterData.admin = twitterData.id; // Use community ID as admin identifier
        }

        console.log('🔍 Final Twitter data result:', twitterData);
        return twitterData;
    } catch (error) {
        console.error('Error extracting Twitter data:', error);
        return { type: null, id: null, handle: null, admin: null };
    }
}

console.log('🔥 Firebase Admin SDK initialized');
console.log('Project ID:', admin.app().options.projectId);

// Test Firebase connection at startup
async function testFirebase() {
    try {
        const testDoc = await db.collection('test').doc('connection').set({
            test: true,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ Firebase connection test successful');
    } catch (error) {
        console.error('❌ Firebase connection test failed:', error);
    }
}

// ========== TRADING FUNCTIONS ==========

async function executeAPITrade(params) {
    try {
        const response = await fetch(`https://pumpportal.fun/api/trade?api-key=${PUMP_PORTAL_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...params,
                pool: params.pool || 'auto',
                skipPreflight: "true",
                jitoOnly: "true"
            })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || 'Unknown API error');
        }

        return {
            signature: data.signature,
            confirmationPromise: connection.confirmTransaction(data.signature, 'processed')
        };
    } catch (error) {
        console.error(`API trade failed:`, error.message);
        throw error;
    }
}

app.get('/api/pair-address/:tokenAddress', async (req, res) => {
    try {
        const { tokenAddress } = req.params;

        if (!tokenAddress) {
            return res.status(400).json({ error: 'Token address is required' });
        }

        console.log(`🔍 Getting pair address for token: ${tokenAddress}`);

        const pairData = await getPairAddressFromDexScreener(tokenAddress);

        if (pairData) {
            console.log(`✅ Found pair data:`, pairData);

            res.json({
                success: true,
                tokenAddress,
                pairData,
                axiomUrl: `https://axiom.trade/meme/${pairData.pairAddress}`,
                dexScreenerUrl: pairData.url
            });
        } else {
            console.log(`❌ No pair found for token: ${tokenAddress}`);

            res.json({
                success: false,
                tokenAddress,
                message: 'No pair found for this token',
                fallbackAxiomUrl: `https://axiom.trade/meme/${tokenAddress}`
            });
        }
    } catch (error) {
        console.error('❌ Error in pair-address endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            fallbackAxiomUrl: `https://axiom.trade/meme/${req.params.tokenAddress}`
        });
    }
});


async function snipeToken(tokenAddress, config) {
    console.log(`🎯 SNIPING: ${tokenAddress} with ${config.amount} SOL`);

    try {
        const params = {
            action: "buy",
            mint: tokenAddress,
            amount: config.amount,
            denominatedInSol: "true",
            slippage: config.fees || 10,
            priorityFee: config.mevProtection ? 0.00005 : 0.00001
        };

        const { signature } = await executeAPITrade(params);

        // Generate token page URL with pair address lookup for Axiom
        const tokenPageUrl = await getTokenPageUrl(tokenAddress, botState.settings.tokenPageDestination);

        broadcastToClients({
            type: 'snipe_success',
            data: {
                tokenAddress,
                signature,
                amount: config.amount,
                tokenPageUrl,
                timestamp: new Date().toISOString(),
                openTokenPage: true // Signal to open token page
            }
        });

        return { success: true, signature, tokenPageUrl };
    } catch (error) {
        console.error('Snipe failed:', error.message);

        broadcastToClients({
            type: 'snipe_error',
            data: {
                tokenAddress,
                error: error.message,
                timestamp: new Date().toISOString()
            }
        });

        return { success: false, error: error.message };
    }
}

async function getTokenPageUrl(tokenAddress, destination, platform = null) {
    console.log(`🌐 Generating token page URL for ${tokenAddress} on ${destination}`);

    switch (destination) {
        case 'neo_bullx':
            return `https://neo.bullx.io/terminal?chainId=1399811149&address=${tokenAddress}`;

        case 'axiom':
            // Try to get pair address from DexScreener for Axiom
            try {
                const pairData = await getPairAddressFromDexScreener(tokenAddress);

                if (pairData && pairData.pairAddress) {
                    console.log(`🎯 Using Axiom with pair address: ${pairData.pairAddress}`);
                    return `https://axiom.trade/meme/${pairData.pairAddress}`;
                } else {
                    console.log(`⚠️ No pair found, using token address for Axiom: ${tokenAddress}`);
                    return `https://axiom.trade/meme/${tokenAddress}`;
                }
            } catch (error) {
                console.error('❌ Error getting pair address for Axiom:', error);
                return `https://axiom.trade/meme/${tokenAddress}`;
            }

        default:
            return `https://neo.bullx.io/terminal?chainId=1399811149&address=${tokenAddress}`;
    }
}

// Fetch metadata from IPFS
async function fetchTokenMetadata(uri) {
    try {
        if (!uri) return {};

        const response = await fetch(uri);
        if (!response.ok) return {};

        const metadata = await response.json();
        return metadata;
    } catch (error) {
        console.error('Failed to fetch metadata:', error);
        return {};
    }
}

// ========== TOKEN PROCESSING ==========
// ========== REVERT TO YOUR ORIGINAL WORKING CODE ==========
// Only fix the community detection logic, keep everything else EXACTLY the same

// KEEP YOUR ORIGINAL connectToPumpPortal() - DON'T CHANGE IT
// KEEP YOUR ORIGINAL connectToLetsBonk() - DON'T CHANGE IT  
// KEEP YOUR ORIGINAL start/stop endpoints - DON'T CHANGE THEM

// ONLY REPLACE processNewToken() function with this fixed version:

// ADD THIS COMMUNITY MATCHING FUNCTION
// ADD THIS COMMUNITY MATCHING FUNCTION
async function scrapeCommunityAndMatchAdmins(communityId, tokenData) {
    try {
        console.log(`🔍 Scraping community ${communityId} for admin matching...`);

        // First, check if the community ID itself is in our lists (FALLBACK METHOD)
        const communityIdStr = communityId.toString();

        // Check primary admins list for community ID
        const primaryAdminConfig = botState.checkAdminInPrimary(communityIdStr);
        if (primaryAdminConfig) {
            console.log(`🎯 Community ID ${communityId} found directly in PRIMARY admin list!`);

            // Broadcast to frontend
            broadcastToClients({
                type: 'community_id_match_found',
                data: {
                    communityId: communityId,
                    matchType: 'primary',
                    matchedAs: 'community_id_direct',
                    yourPrimaryList: Array.from(botState.primaryAdminList.values()).map(item => item.address),
                    yourSecondaryList: Array.from(botState.secondaryAdminList.values()).map(item => item.address)
                }
            });

            return {
                matchType: 'primary_admin',
                matchedEntity: `Community ${communityId}`,
                detectionReason: `Primary Community ID: ${communityId}`,
                config: primaryAdminConfig,
                communityAdmins: [],
                matchedAdmin: { username: communityId, badgeType: 'Community' }
            };
        }

        // Check secondary admins list for community ID
        const secondaryAdminConfig = botState.checkAdminInSecondary(communityIdStr);
        if (secondaryAdminConfig) {
            console.log(`🔔 Community ID ${communityId} found directly in SECONDARY admin list!`);

            // Broadcast to frontend
            broadcastToClients({
                type: 'community_id_match_found',
                data: {
                    communityId: communityId,
                    matchType: 'secondary',
                    matchedAs: 'community_id_direct',
                    yourPrimaryList: Array.from(botState.primaryAdminList.values()).map(item => item.address),
                    yourSecondaryList: Array.from(botState.secondaryAdminList.values()).map(item => item.address)
                }
            });

            return {
                matchType: 'secondary_admin',
                matchedEntity: `Community ${communityId}`,
                detectionReason: `Secondary Community ID: ${communityId}`,
                config: secondaryAdminConfig,
                communityAdmins: [],
                matchedAdmin: { username: communityId, badgeType: 'Community' }
            };
        }

        // If community ID not in lists, try scraping community admins
        console.log(`📋 Community ID not in lists, attempting to scrape community admins...`);

        // Initialize scraper if needed
        if (!twitterScraper.isInitialized) {
            console.log(`🤖 Initializing Twitter scraper...`);
            const initSuccess = await twitterScraper.init();
            if (!initSuccess) {
                console.log(`❌ Failed to initialize Twitter scraper, using community ID fallback`);

                // Broadcast initialization failure
                broadcastToClients({
                    type: 'community_scraping_failed',
                    data: {
                        communityId: communityId,
                        reason: 'Failed to initialize Twitter scraper',
                        step: 'initialization',
                        fallbackUsed: true,
                        communityIdInPrimary: false,
                        communityIdInSecondary: false,
                        yourPrimaryList: Array.from(botState.primaryAdminList.values()).map(item => item.address),
                        yourSecondaryList: Array.from(botState.secondaryAdminList.values()).map(item => item.address)
                    }
                });

                return null;
            }
        }

        // Check session status instead of trying to login
        console.log(`🔍 Checking Twitter session status...`);
        const sessionStatus = await twitterScraper.checkSessionStatus();

        if (!sessionStatus.loggedIn) {
            console.log(`❌ Twitter session not active: ${sessionStatus.error || 'Not logged in'}`);

            // Broadcast session not active
            broadcastToClients({
                type: 'community_scraping_failed',
                data: {
                    communityId: communityId,
                    reason: 'Twitter session not active - admin needs to login manually',
                    step: 'session_check',
                    fallbackUsed: true,
                    sessionStatus: sessionStatus,
                    communityIdInPrimary: botState.checkAdminInPrimary(communityIdStr) ? true : false,
                    communityIdInSecondary: botState.checkAdminInSecondary(communityIdStr) ? true : false,
                    yourPrimaryList: Array.from(botState.primaryAdminList.values()).map(item => item.address),
                    yourSecondaryList: Array.from(botState.secondaryAdminList.values()).map(item => item.address),
                    needsManualLogin: true
                }
            });

            return null;
        }

        console.log(`✅ Twitter session is active, proceeding with community scraping...`);

        // Scrape community admins
        console.log(`🕷️ Scraping community ${communityId} for admin list...`);
        const communityAdmins = await twitterScraper.scrapeCommunityAdmins(communityId);

        if (communityAdmins.length === 0) {
            console.log(`⚠️ No admins found in community ${communityId}`);

            // Broadcast no admins found
            broadcastToClients({
                type: 'community_scraping_failed',
                data: {
                    communityId: communityId,
                    reason: 'No admins found in community',
                    step: 'scraping',
                    fallbackUsed: true,
                    communityIdInPrimary: botState.checkAdminInPrimary(communityIdStr) ? true : false,
                    communityIdInSecondary: botState.checkAdminInSecondary(communityIdStr) ? true : false,
                    yourPrimaryList: Array.from(botState.primaryAdminList.values()).map(item => item.address),
                    yourSecondaryList: Array.from(botState.secondaryAdminList.values()).map(item => item.address)
                }
            });

            return null;
        }

        console.log(`📊 Found ${communityAdmins.length} admin(s) in community ${communityId}:`,
            communityAdmins.map(admin => `@${admin.username} (${admin.badgeType})`));

        // 🔥 NEW: Broadcast successful scraping to frontend for debugging
        broadcastToClients({
            type: 'community_admins_scraped',
            data: {
                communityId: communityId,
                admins: communityAdmins,
                totalAdmins: communityAdmins.length,
                scrapedAt: new Date().toISOString(),
                yourPrimaryList: Array.from(botState.primaryAdminList.values()).map(item => item.address),
                yourSecondaryList: Array.from(botState.secondaryAdminList.values()).map(item => item.address)
            }
        });

        // Check if any community admin is in our lists
        for (const admin of communityAdmins) {
            console.log(`🔍 Checking community admin: @${admin.username} (${admin.badgeType})`);

            // Check primary admins list
            const primaryAdminConfig = botState.checkAdminInPrimary(admin.username);
            if (primaryAdminConfig) {
                console.log(`🎯 Community admin @${admin.username} found in PRIMARY admin list!`);

                // Broadcast match found
                broadcastToClients({
                    type: 'community_admin_match_found',
                    data: {
                        communityId: communityId,
                        matchType: 'primary',
                        matchedAdmin: admin,
                        matchedAs: 'community_admin_scraping',
                        allScrapedAdmins: communityAdmins
                    }
                });

                return {
                    matchType: 'primary_admin',
                    matchedEntity: admin.username,
                    detectionReason: `Primary Community Admin: @${admin.username} (${admin.badgeType}) from Community ${communityId}`,
                    config: primaryAdminConfig,
                    communityAdmins: communityAdmins,
                    matchedAdmin: admin,
                    scrapingMethod: 'community_admin_scraping'
                };
            }

            // Check secondary admins list
            const secondaryAdminConfig = botState.checkAdminInSecondary(admin.username);
            if (secondaryAdminConfig) {
                console.log(`🔔 Community admin @${admin.username} found in SECONDARY admin list!`);

                // Broadcast match found
                broadcastToClients({
                    type: 'community_admin_match_found',
                    data: {
                        communityId: communityId,
                        matchType: 'secondary',
                        matchedAdmin: admin,
                        matchedAs: 'community_admin_scraping',
                        allScrapedAdmins: communityAdmins
                    }
                });

                return {
                    matchType: 'secondary_admin',
                    matchedEntity: admin.username,
                    detectionReason: `Secondary Community Admin: @${admin.username} (${admin.badgeType}) from Community ${communityId}`,
                    config: secondaryAdminConfig,
                    communityAdmins: communityAdmins,
                    matchedAdmin: admin,
                    scrapingMethod: 'community_admin_scraping'
                };
            }

            // Also check for username variations (with and without @)
            const usernameVariations = [
                admin.username,
                `@${admin.username}`,
                admin.username.toLowerCase(),
                `@${admin.username.toLowerCase()}`
            ];

            for (const variation of usernameVariations) {
                // Check primary with variations
                const primaryVariationConfig = botState.checkAdminInPrimary(variation);
                if (primaryVariationConfig) {
                    console.log(`🎯 Community admin @${admin.username} found in PRIMARY admin list (variation: ${variation})!`);

                    // Broadcast variation match found
                    broadcastToClients({
                        type: 'community_admin_match_found',
                        data: {
                            communityId: communityId,
                            matchType: 'primary',
                            matchedAdmin: admin,
                            matchedAs: 'community_admin_scraping_variation',
                            matchedVariation: variation,
                            allScrapedAdmins: communityAdmins
                        }
                    });

                    return {
                        matchType: 'primary_admin',
                        matchedEntity: variation,
                        detectionReason: `Primary Community Admin: @${admin.username} (${admin.badgeType}) from Community ${communityId} (matched as ${variation})`,
                        config: primaryVariationConfig,
                        communityAdmins: communityAdmins,
                        matchedAdmin: admin,
                        scrapingMethod: 'community_admin_scraping_variation'
                    };
                }

                // Check secondary with variations
                const secondaryVariationConfig = botState.checkAdminInSecondary(variation);
                if (secondaryVariationConfig) {
                    console.log(`🔔 Community admin @${admin.username} found in SECONDARY admin list (variation: ${variation})!`);

                    // Broadcast variation match found
                    broadcastToClients({
                        type: 'community_admin_match_found',
                        data: {
                            communityId: communityId,
                            matchType: 'secondary',
                            matchedAdmin: admin,
                            matchedAs: 'community_admin_scraping_variation',
                            matchedVariation: variation,
                            allScrapedAdmins: communityAdmins
                        }
                    });

                    return {
                        matchType: 'secondary_admin',
                        matchedEntity: variation,
                        detectionReason: `Secondary Community Admin: @${admin.username} (${admin.badgeType}) from Community ${communityId} (matched as ${variation})`,
                        config: secondaryVariationConfig,
                        communityAdmins: communityAdmins,
                        matchedAdmin: admin,
                        scrapingMethod: 'community_admin_scraping_variation'
                    };
                }
            }
        }

        console.log(`❌ No community admins from ${communityId} found in admin lists`);
        console.log(`📋 Community admins found: ${communityAdmins.map(admin => `@${admin.username}`).join(', ')}`);
        console.log(`📋 Primary admin list: ${Array.from(botState.primaryAdminList.values()).map(item => item.address).join(', ')}`);
        console.log(`📋 Secondary admin list: ${Array.from(botState.secondaryAdminList.values()).map(item => item.address).join(', ')}`);

        // Broadcast no matches found
        broadcastToClients({
            type: 'community_admins_no_match',
            data: {
                communityId: communityId,
                scrapedAdmins: communityAdmins,
                yourPrimaryList: Array.from(botState.primaryAdminList.values()).map(item => item.address),
                yourSecondaryList: Array.from(botState.secondaryAdminList.values()).map(item => item.address),
                totalScrapedAdmins: communityAdmins.length
            }
        });

        return null;

    } catch (error) {
        console.error(`❌ Error scraping community ${communityId}:`, error);
        console.error(`📋 Error details:`, error.message);

        // Broadcast error
        broadcastToClients({
            type: 'community_scraping_error',
            data: {
                communityId: communityId,
                error: error.message,
                step: 'unknown',
                fallbackUsed: true
            }
        });

        return null;
    }
}

// ========== COMPLETE ENHANCED processNewToken FUNCTION ==========
async function processNewToken(tokenData, platform) {
    const tokenAddress = tokenData.mint;
    const creatorWallet = tokenData.creator || tokenData.traderPublicKey;

    if (botState.processedTokens.has(tokenAddress)) {
        return;
    }

    botState.processedTokens.add(tokenAddress);

    console.log(`📊 Processing new token: ${tokenAddress} from ${platform}`);

    // Get enhanced Twitter data
    const twitterData = await getTwitterDataFromToken(tokenData);

    // Debug logs
    console.log('🔍 TWITTER DATA EXTRACTED:', {
        type: twitterData.type,
        id: twitterData.id,
        handle: twitterData.handle,
        admin: twitterData.admin
    });

    let metadata = {};
    let actualImageUri = null;

    if (tokenData.uri) {
        metadata = await fetchTokenMetadata(tokenData.uri);
        actualImageUri = metadata.image || tokenData.uri;
    }

    // Create comprehensive token data object
    const completeTokenData = {
        tokenAddress,
        platform,
        creatorWallet,
        name: metadata.name || tokenData.name || 'Unknown Token',
        symbol: metadata.symbol || tokenData.symbol || 'UNKNOWN',
        description: metadata.description || null,
        uri: actualImageUri,
        marketCapSol: tokenData.marketCapSol || 0,
        solAmount: tokenData.solAmount || 0,
        pool: tokenData.pool || (platform === 'pumpfun' ? 'pump' : 'bonk'),

        // Enhanced Twitter data
        twitterType: twitterData.type,
        twitterCommunityId: twitterData.id,
        twitterHandle: twitterData.handle,
        twitterAdmin: twitterData.admin,
        twitterUrl: twitterData.originalUrl,

        // Metadata fields
        website: metadata.website || null,
        signature: tokenData.signature || null,
        initialBuy: tokenData.initialBuy || 0,
        bondingCurveKey: tokenData.bondingCurveKey || null,
        vTokensInBondingCurve: tokenData.vTokensInBondingCurve || 0,
        vSolInBondingCurve: tokenData.vSolInBondingCurve || 0,
        solInPool: tokenData.solInPool || null,
        tokensInPool: tokenData.tokensInPool || null,
        newTokenBalance: tokenData.newTokenBalance || null
    };

    console.log(`🔍 Twitter Detection Result:`, {
        type: twitterData.type,
        communityId: twitterData.id,
        handle: twitterData.handle,
        admin: twitterData.admin
    });

    // ========== FIXED COMMUNITY REUSE CHECK ==========
    if (twitterData.type === 'community' && twitterData.id && botState.settings.enableCommunityReuse) {
        console.log(`🏘️ Checking if community ${twitterData.id} was used before...`);
        const communityUsedInFirebase = await isCommunityUsedInFirebase(twitterData.id);
        if (communityUsedInFirebase) {
            console.log(`❌ COMMUNITY ALREADY USED: Community ${twitterData.id} skipped due to reuse prevention`);

            // Add to detected tokens as blocked
            const blockedTokenData = {
                ...completeTokenData,
                matchType: 'community_reused',
                matchedEntity: `Community ${twitterData.id} (Already Used)`,
                detectionReason: 'Community already used - blocked by reuse prevention',
                blocked: true
            };

            botState.addDetectedToken(tokenAddress, blockedTokenData);

            broadcastToClients({
                type: 'token_detected',
                data: {
                    ...blockedTokenData,
                    blocked: true,
                    blockReason: 'Community already used'
                }
            });

            return; // STOP PROCESSING - DON'T CONTINUE
        } else {
            console.log(`✅ Community ${twitterData.id} not used before, continuing processing...`);
        }
    }

    // ========== NEW: COMMUNITY ADMIN SCRAPING AND MATCHING ==========
    if (botState.settings.enableAdminFilter && twitterData.type === 'community' && twitterData.id) {
        console.log(`🏘️ Found Twitter community: ${twitterData.id} - scraping admins for matching...`);

        // Scrape community admins and match with our lists
        const communityMatchResult = await scrapeCommunityAndMatchAdmins(twitterData.id, completeTokenData);

        if (communityMatchResult && communityMatchResult.matchType !== 'no_match') {
            console.log(`🎯 Community admin match found: ${communityMatchResult.matchType}`);

            const detectedTokenData = {
                ...completeTokenData,
                matchType: communityMatchResult.matchType,
                matchedEntity: communityMatchResult.matchedEntity,
                detectionReason: communityMatchResult.detectionReason,
                config: communityMatchResult.config,
                communityAdmins: communityMatchResult.communityAdmins,
                matchedAdmin: communityMatchResult.matchedAdmin
            };

            botState.addDetectedToken(tokenAddress, detectedTokenData);

            // Save community to Firebase on match
            await markCommunityAsUsedInFirebase(twitterData.id, detectedTokenData);

            if (communityMatchResult.matchType === 'primary_admin') {
                broadcastToClients({
                    type: 'token_detected',
                    data: detectedTokenData
                });

                if (!botState.settings.detectionOnlyMode) {
                    await snipeToken(tokenAddress, communityMatchResult.config);
                }
            } else if (communityMatchResult.matchType === 'secondary_admin') {
                // Trigger popup for secondary matches
                broadcastToClients({
                    type: 'secondary_popup_trigger',
                    data: {
                        tokenData: detectedTokenData,
                        globalSnipeSettings: botState.settings.globalSnipeSettings,
                        timestamp: new Date().toISOString()
                    }
                });

                // Play sound notification
                broadcastToClients({
                    type: 'secondary_notification',
                    data: {
                        tokenAddress,
                        soundNotification: communityMatchResult.config.soundNotification,
                        timestamp: new Date().toISOString()
                    }
                });
            }
            return;
        } else {
            console.log(`❌ No community admins from ${twitterData.id} found in admin lists`);
            // Continue with regular processing if no admin match found
        }
    }

    // Check if "snipe all tokens" mode is enabled
    if (botState.settings.snipeAllTokens) {
        console.log(`🎯 SNIPE ALL MODE: Token detected - ${tokenAddress}`);

        const detectedTokenData = {
            ...completeTokenData,
            matchType: 'snipe_all',
            matchedEntity: 'All tokens',
            detectionReason: 'Snipe All Mode Enabled'
        };

        botState.addDetectedToken(tokenAddress, detectedTokenData);

        // ✅ SAVE COMMUNITY TO FIREBASE WHEN DETECTED
        if (twitterData.type === 'community' && twitterData.id) {
            await markCommunityAsUsedInFirebase(twitterData.id, detectedTokenData);
        }

        broadcastToClients({
            type: 'token_detected',
            data: detectedTokenData
        });

        if (!botState.settings.detectionOnlyMode) {
            const defaultConfig = botState.settings.globalSnipeSettings;
            await snipeToken(tokenAddress, defaultConfig);
        }
        return;
    }

    // CONSOLIDATED ADMIN FILTERING (handles both Twitter admins AND wallet addresses)
    if (botState.settings.enableAdminFilter) {
        console.log('📋 Current Primary Admins List:', Array.from(botState.primaryAdminList.values()).map(item => item.address));

        // 1. Check Twitter Individual Admin matching
        if (twitterData.admin && twitterData.type === 'individual') {
            console.log(`👤 Found individual Twitter: @${twitterData.handle}`);

            // Check primary admins list
            const primaryAdminConfig = botState.checkAdminInPrimary(twitterData.handle);
            if (primaryAdminConfig) {
                console.log(`✅ Admin @${twitterData.handle} found in primary admin list!`);

                const detectedTokenData = {
                    ...completeTokenData,
                    matchType: 'primary_admin',
                    matchedEntity: twitterData.handle,
                    detectionReason: `Primary Admin: @${twitterData.handle}`,
                    config: primaryAdminConfig
                };

                botState.addDetectedToken(tokenAddress, detectedTokenData);

                broadcastToClients({
                    type: 'token_detected',
                    data: detectedTokenData
                });

                if (!botState.settings.detectionOnlyMode) {
                    await snipeToken(tokenAddress, primaryAdminConfig);
                }
                return;
            }

            // Check secondary admins list
            const secondaryAdminConfig = botState.checkAdminInSecondary(twitterData.handle);
            if (secondaryAdminConfig) {
                console.log(`🔔 Admin @${twitterData.handle} found in secondary admin list!`);

                const detectedTokenData = {
                    ...completeTokenData,
                    matchType: 'secondary_admin',
                    matchedEntity: twitterData.handle,
                    detectionReason: `Secondary Admin: @${twitterData.handle}`,
                    config: secondaryAdminConfig
                };

                botState.addDetectedToken(tokenAddress, detectedTokenData);

                // Trigger popup for secondary matches
                broadcastToClients({
                    type: 'secondary_popup_trigger',
                    data: {
                        tokenData: detectedTokenData,
                        globalSnipeSettings: botState.settings.globalSnipeSettings,
                        timestamp: new Date().toISOString()
                    }
                });

                // Play sound notification
                broadcastToClients({
                    type: 'secondary_notification',
                    data: {
                        tokenAddress,
                        soundNotification: secondaryAdminConfig.soundNotification,
                        timestamp: new Date().toISOString()
                    }
                });
                return;
            }
        }

        // 2. CONSOLIDATED WALLET ADDRESS CHECKING
        if (creatorWallet) {
            console.log(`💰 Checking creator wallet: ${creatorWallet}`);

            // Check if wallet address is in primary admins list
            const primaryAdminConfig = botState.checkAdminInPrimary(creatorWallet);
            if (primaryAdminConfig) {
                console.log(`✅ Wallet ${creatorWallet} found in primary admin list!`);

                const detectedTokenData = {
                    ...completeTokenData,
                    matchType: 'primary_admin',
                    matchedEntity: creatorWallet,
                    detectionReason: `Primary Wallet: ${creatorWallet.substring(0, 8)}...`,
                    config: primaryAdminConfig
                };

                botState.addDetectedToken(tokenAddress, detectedTokenData);

                broadcastToClients({
                    type: 'token_detected',
                    data: detectedTokenData
                });

                if (!botState.settings.detectionOnlyMode) {
                    await snipeToken(tokenAddress, primaryAdminConfig);
                }
                return;
            }

            // Check if wallet address is in secondary admins list
            const secondaryAdminConfig = botState.checkAdminInSecondary(creatorWallet);
            if (secondaryAdminConfig) {
                console.log(`🔔 Wallet ${creatorWallet} found in secondary admin list!`);

                const detectedTokenData = {
                    ...completeTokenData,
                    matchType: 'secondary_admin',
                    matchedEntity: creatorWallet,
                    detectionReason: `Secondary Wallet: ${creatorWallet.substring(0, 8)}...`,
                    config: secondaryAdminConfig
                };

                botState.addDetectedToken(tokenAddress, detectedTokenData);

                // Trigger popup for secondary matches
                broadcastToClients({
                    type: 'secondary_popup_trigger',
                    data: {
                        tokenData: detectedTokenData,
                        globalSnipeSettings: botState.settings.globalSnipeSettings,
                        timestamp: new Date().toISOString()
                    }
                });

                // Play sound notification
                broadcastToClients({
                    type: 'secondary_notification',
                    data: {
                        tokenAddress,
                        soundNotification: secondaryAdminConfig.soundNotification,
                        timestamp: new Date().toISOString()
                    }
                });
                return;
            }
        }
    }

    // If admin filtering is disabled, detect all tokens
    if (!botState.settings.enableAdminFilter) {
        console.log(`📢 Admin filtering disabled - detecting token: ${tokenAddress}`);

        const detectedTokenData = {
            ...completeTokenData,
            matchType: 'no_filters',
            matchedEntity: 'No filters active',
            detectionReason: 'Admin filtering disabled'
        };

        botState.addDetectedToken(tokenAddress, detectedTokenData);

        // ✅ SAVE COMMUNITY TO FIREBASE EVEN IF NO FILTERING
        if (twitterData.type === 'community' && twitterData.id) {
            await markCommunityAsUsedInFirebase(twitterData.id, detectedTokenData);
        }

        broadcastToClients({
            type: 'token_detected',
            data: detectedTokenData
        });
        return;
    }

    console.log(`❌ Token ${tokenAddress} doesn't match any criteria`);
}

// ========== API ENDPOINTS ==========
app.post('/api/twitter-logout', async (req, res) => {
    try {
        if (!twitterScraper.isInitialized) {
            return res.status(400).json({ 
                success: false,
                error: 'Twitter scraper not initialized' 
            });
        }

        console.log('📞 API: Twitter logout requested');
        const success = await twitterScraper.logout();
        
        if (success) {
            res.json({ 
                success: true, 
                message: 'Successfully logged out from Twitter' 
            });
        } else {
            res.json({ 
                success: false, 
                message: 'Logout encountered issues but session marked as inactive' 
            });
        }
    } catch (error) {
        console.error('❌ API: Twitter logout error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Global snipe settings API endpoints
app.post('/api/global-snipe-settings', (req, res) => {
    const { amount, fees, mevProtection, soundNotification } = req.body;

    if (amount) botState.settings.globalSnipeSettings.amount = amount;
    if (fees) botState.settings.globalSnipeSettings.fees = fees;
    if (typeof mevProtection !== 'undefined') botState.settings.globalSnipeSettings.mevProtection = mevProtection;
    if (soundNotification) botState.settings.globalSnipeSettings.soundNotification = soundNotification;

    console.log('Global snipe settings updated:', botState.settings.globalSnipeSettings);

    res.json({
        success: true,
        globalSnipeSettings: botState.settings.globalSnipeSettings
    });
});

app.post('/api/snipe-with-global-settings/:tokenAddress', async (req, res) => {
    const { tokenAddress } = req.params;
    const globalSettings = botState.settings.globalSnipeSettings;

    try {
        const result = await snipeToken(tokenAddress, globalSettings);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Firebase management endpoints
app.get('/api/firebase/used-communities', async (req, res) => {
    try {
        const snapshot = await db.collection('usedCommunities').get();
        const communities = [];
        snapshot.forEach(doc => {
            communities.push({
                id: doc.id,
                ...doc.data()
            });
        });
        res.json({ communities });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add these endpoints after the existing API routes

// Get all uploaded sound files
app.get('/api/sound-files', async (req, res) => {
    try {
        await ensureSoundsDir();

        // ✅ LOAD METADATA FILE
        const metadataPath = path.join(SOUNDS_DIR, 'metadata.json');
        let metadata = {};

        try {
            const metadataContent = await fs.readFile(metadataPath, 'utf8');
            metadata = JSON.parse(metadataContent);
        } catch (error) {
            console.log('No metadata file found, will use generated names');
        }

        const files = await fs.readdir(SOUNDS_DIR);
        const soundFiles = [];

        for (const filename of files) {
            // Skip metadata file
            if (filename === 'metadata.json') continue;

            try {
                const filePath = path.join(SOUNDS_DIR, filename);
                const stats = await fs.stat(filePath);

                soundFiles.push({
                    filename,
                    originalName: metadata[filename]?.originalName || filename, // ✅ USE STORED ORIGINAL NAME
                    size: stats.size,
                    uploadedAt: metadata[filename]?.uploadedAt || stats.birthtime,
                    mimetype: metadata[filename]?.mimetype || getMimeType(path.extname(filename))
                });
            } catch (error) {
                console.error(`Error getting stats for ${filename}:`, error);
            }
        }

        res.json({
            success: true,
            files: soundFiles.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
        });
    } catch (error) {
        console.error('Error fetching sound files:', error);
        res.status(500).json({ error: error.message });
    }
});

// Upload a new sound file
app.post('/api/upload-sound', uploadSound.single('soundFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No sound file provided' });
        }

        const soundFile = {
            filename: req.file.filename,
            originalName: req.file.originalname, // ✅ This preserves the original name
            size: req.file.size,
            mimetype: req.file.mimetype,
            uploadedAt: new Date(),
            path: req.file.path
        };

        // ✅ SAVE ORIGINAL NAME TO A JSON FILE FOR RETRIEVAL
        const metadataPath = path.join(SOUNDS_DIR, 'metadata.json');
        let metadata = {};

        try {
            const existingData = await fs.readFile(metadataPath, 'utf8');
            metadata = JSON.parse(existingData);
        } catch (error) {
            // File doesn't exist yet, start with empty object
        }

        metadata[req.file.filename] = {
            originalName: req.file.originalname,
            uploadedAt: new Date().toISOString(),
            size: req.file.size,
            mimetype: req.file.mimetype
        };

        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

        console.log('🔊 Sound file uploaded:', soundFile);

        res.json({
            success: true,
            message: 'Sound file uploaded successfully',
            filename: soundFile.filename,
            originalName: soundFile.originalName,
            size: soundFile.size
        });
    } catch (error) {
        console.error('Error uploading sound file:', error);
        res.status(500).json({ error: error.message });
    }
});

// ADD THIS NEW ENDPOINT after line ~1850:
app.post('/api/clean-admin-lists', async (req, res) => {
    try {
        console.log('🧹 Cleaning admin list entries...');

        // Clean primary admins
        for (const [id, config] of botState.primaryAdminList.entries()) {
            if (config.address) {
                const cleanAddress = config.address.trim();
                if (cleanAddress !== config.address) {
                    console.log(`Cleaning primary admin: "${config.address}" -> "${cleanAddress}"`);
                    config.address = cleanAddress;

                    // Update in Firebase
                    await saveAdminListToFirebase('primary_admins', config);
                }
            }
        }

        // Clean secondary admins
        for (const [id, config] of botState.secondaryAdminList.entries()) {
            if (config.address) {
                const cleanAddress = config.address.trim();
                if (cleanAddress !== config.address) {
                    console.log(`Cleaning secondary admin: "${config.address}" -> "${cleanAddress}"`);
                    config.address = cleanAddress;

                    // Update in Firebase
                    await saveAdminListToFirebase('secondary_admins', config);
                }
            }
        }

        res.json({
            success: true,
            message: 'Admin lists cleaned successfully'
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a sound file
app.delete('/api/sound-files/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(SOUNDS_DIR, filename);

        try {
            await fs.access(filePath);
            await fs.unlink(filePath);

            // ✅ CLEAN UP METADATA
            const metadataPath = path.join(SOUNDS_DIR, 'metadata.json');
            try {
                const metadataContent = await fs.readFile(metadataPath, 'utf8');
                const metadata = JSON.parse(metadataContent);
                delete metadata[filename];
                await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
            } catch (error) {
                console.log('No metadata to clean up');
            }

            console.log('🗑️ Sound file deleted:', filename);

            res.json({
                success: true,
                message: 'Sound file deleted successfully'
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({ error: 'Sound file not found' });
            }
            throw error;
        }
    } catch (error) {
        console.error('Error deleting sound file:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve uploaded sound files
app.get('/api/sounds/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(SOUNDS_DIR, filename);

    res.sendFile(filePath, (error) => {
        if (error) {
            console.error('Error serving sound file:', error);
            res.status(404).json({ error: 'Sound file not found' });
        }
    });
});

app.delete('/api/firebase/used-communities/:communityId', async (req, res) => {
    try {
        const { communityId } = req.params;
        await db.collection('usedCommunities').doc(communityId).delete();
        res.json({ success: true, message: `Community ${communityId} removed from Firebase` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/firebase/used-communities', async (req, res) => {
    try {
        const snapshot = await db.collection('usedCommunities').get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        res.json({ success: true, message: 'All used communities cleared from Firebase' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Enhanced Firebase admin list endpoints
app.get('/api/firebase/admin-lists', async (req, res) => {
    try {
        const primaryAdmins = await loadAdminListFromFirebase('primary_admins');
        const secondaryAdmins = await loadAdminListFromFirebase('secondary_admins');

        res.json({
            success: true,
            data: {
                primary_admins: primaryAdmins,
                secondary_admins: secondaryAdmins
            },
            stats: {
                primaryCount: primaryAdmins.length,
                secondaryCount: secondaryAdmins.length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/firebase/sync-admin-lists', async (req, res) => {
    try {
        const success = await botState.loadAdminListsFromFirebase();

        if (success) {
            // Broadcast sync update to all clients
            broadcastToClients({
                type: 'admin_lists_synced',
                data: {
                    stats: botState.getStats(),
                    timestamp: new Date().toISOString()
                }
            });

            res.json({
                success: true,
                message: 'Admin lists synchronized from Firebase',
                stats: botState.getStats()
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to sync admin lists from Firebase'
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/firebase/admin-lists/:listType', async (req, res) => {
    try {
        const { listType } = req.params;

        // Get all documents in the collection
        const snapshot = await db.collection(listType).get();

        // Delete all documents
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        // Clear local state
        switch (listType) {
            case 'primary_admins':
                botState.primaryAdminList.clear();
                break;
            case 'secondary_admins':
                botState.secondaryAdminList.clear();
                break;
        }

        // Broadcast update
        broadcastToClients({
            type: 'admin_list_cleared',
            data: {
                listType,
                stats: botState.getStats(),
                timestamp: new Date().toISOString()
            }
        });

        res.json({
            success: true,
            message: `All ${listType} cleared from Firebase and local state`,
            clearedCount: snapshot.docs.length,
            stats: botState.getStats()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test Firebase connection endpoint
app.get('/api/test-firebase', async (req, res) => {
    try {
        const testDoc = await db.collection('test').add({
            message: 'Firebase connected successfully!',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json({
            success: true,
            message: 'Firebase connected!',
            docId: testDoc.id
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// WebSocket connections to platforms
function connectToPumpPortal() {
    if (botState.pumpPortalSocket) {
        botState.pumpPortalSocket.close();
    }

    console.log('🔌 Connecting to Pump Portal...');
    botState.pumpPortalSocket = new WebSocket('wss://pumpportal.fun/api/data');

    botState.pumpPortalSocket.onopen = () => {
        console.log('✅ Connected to Pump Portal WebSocket');
        botState.pumpPortalSocket.send(JSON.stringify({ method: "subscribeNewToken" }));

        broadcastToClients({
            type: 'platform_status',
            data: { platform: 'pumpfun', status: 'connected' }
        });
    };

    botState.pumpPortalSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.txType === 'create' && botState.isRunning) {
                processNewToken(data, 'pumpfun');
            }
        } catch (error) {
            console.error('Error processing Pump Portal message:', error);
        }
    };

    botState.pumpPortalSocket.onerror = (error) => {
        console.error('Pump Portal WebSocket error:', error);
        broadcastToClients({
            type: 'platform_status',
            data: { platform: 'pumpfun', status: 'error', error: error.message }
        });
    };

    botState.pumpPortalSocket.onclose = () => {
        console.log('Pump Portal WebSocket closed');
        broadcastToClients({
            type: 'platform_status',
            data: { platform: 'pumpfun', status: 'disconnected' }
        });

        if (botState.isRunning) {
            botState.reconnectTimeouts.set('pumpfun', setTimeout(() => {
                connectToPumpPortal();
            }, 5000));
        }
    };
}

function connectToLetsBonk() {
    console.log('🔌 LetsBonk connection placeholder');
    broadcastToClients({
        type: 'platform_status',
        data: { platform: 'letsbonk', status: 'not_implemented' }
    });
}

// Main API Routes
app.get('/api/status', (req, res) => {
    res.json({
        isRunning: botState.isRunning,
        settings: botState.settings,
        stats: botState.getStats()
    });
});

app.post('/api/start', (req, res) => {
    if (botState.isRunning) {
        return res.status(400).json({ error: 'Bot is already running' });
    }

    if (!botState.settings.privateKey) {
        return res.status(400).json({ error: 'Private key not set' });
    }

    botState.isRunning = true;
    connectToPumpPortal();
    connectToLetsBonk();

    broadcastToClients({
        type: 'bot_status',
        data: { isRunning: true }
    });

    res.json({ success: true, message: 'Bot started' });
});

app.post('/api/stop', (req, res) => {
    botState.isRunning = false;

    if (botState.pumpPortalSocket) {
        botState.pumpPortalSocket.close();
    }
    if (botState.letsBonkSocket) {
        botState.letsBonkSocket.close();
    }

    botState.reconnectTimeouts.forEach(timeout => clearTimeout(timeout));
    botState.reconnectTimeouts.clear();

    broadcastToClients({
        type: 'bot_status',
        data: { isRunning: false }
    });

    res.json({ success: true, message: 'Bot stopped' });
});

app.post('/api/settings', (req, res) => {
    const { privateKey, tokenPageDestination } = req.body;

    if (privateKey) {
        try {
            Keypair.fromSecretKey(bs58.decode(privateKey));
            botState.settings.privateKey = privateKey;
        } catch (error) {
            return res.status(400).json({ error: 'Invalid private key' });
        }
    }

    if (tokenPageDestination) {
        botState.settings.tokenPageDestination = tokenPageDestination;
    }

    res.json({ success: true, settings: botState.settings });
});

// Updated filter settings endpoint with consolidated admin filtering
app.post('/api/filter-settings', (req, res) => {
    const {
        enableAdminFilter,           // Only admin filter now (handles both Twitter admins and wallet addresses)
        enableCommunityReuse,        // Keep community reuse prevention
        snipeAllTokens,              // Keep snipe all tokens mode
        detectionOnlyMode            // Keep detection only mode
        // REMOVED: enableWalletFilter - consolidated into enableAdminFilter
    } = req.body;

    console.log('🔧 Received filter settings update:', {
        enableAdminFilter,
        enableCommunityReuse,
        snipeAllTokens,
        detectionOnlyMode
    });

    // Update admin filtering (now handles both Twitter admins AND wallet addresses)
    if (typeof enableAdminFilter !== 'undefined') {
        botState.settings.enableAdminFilter = enableAdminFilter;
        console.log(`📋 Admin filtering (Twitter + Wallets): ${enableAdminFilter ? 'ENABLED' : 'DISABLED'}`);
    }

    // Update community reuse prevention
    if (typeof enableCommunityReuse !== 'undefined') {
        botState.settings.enableCommunityReuse = enableCommunityReuse;
        console.log(`🏘️ Community reuse prevention: ${enableCommunityReuse ? 'ENABLED' : 'DISABLED'}`);
    }

    // Update snipe all tokens mode
    if (typeof snipeAllTokens !== 'undefined') {
        botState.settings.snipeAllTokens = snipeAllTokens;
        console.log(`⚡ Snipe all tokens: ${snipeAllTokens ? 'ENABLED' : 'DISABLED'}`);

        // If snipe all is enabled, log warning
        if (snipeAllTokens) {
            console.log('⚠️  WARNING: SNIPE ALL TOKENS MODE ENABLED - This will attempt to snipe EVERY new token!');
        }
    }

    // Update detection only mode
    if (typeof detectionOnlyMode !== 'undefined') {
        botState.settings.detectionOnlyMode = detectionOnlyMode;
        console.log(`🛡️ Detection only mode: ${detectionOnlyMode ? 'ENABLED' : 'DISABLED'}`);

        // If detection only is disabled and snipe all is enabled, log critical warning
        if (!detectionOnlyMode && snipeAllTokens) {
            console.log('🚨 CRITICAL WARNING: Detection only mode is OFF and Snipe all tokens is ON!');
        }
    }

    // Log current filter configuration
    console.log('📊 Current filter configuration:', {
        enableAdminFilter: botState.settings.enableAdminFilter,
        enableCommunityReuse: botState.settings.enableCommunityReuse,
        snipeAllTokens: botState.settings.snipeAllTokens,
        detectionOnlyMode: botState.settings.detectionOnlyMode
    });

    // Update filter logic explanation based on current settings
    let filterExplanation = '';
    if (botState.settings.snipeAllTokens) {
        filterExplanation = 'Will detect and snipe ALL new tokens (all other filters bypassed)';
    } else if (botState.settings.enableAdminFilter) {
        filterExplanation = 'Will detect tokens from wallet addresses or Twitter admins in your Primary/Secondary Admin lists';
    } else {
        filterExplanation = 'Will detect ALL tokens (no filtering applied)';
    }

    console.log(`🎯 Filter behavior: ${filterExplanation}`);

    // Return updated settings
    res.json({
        success: true,
        settings: {
            enableAdminFilter: botState.settings.enableAdminFilter,
            enableCommunityReuse: botState.settings.enableCommunityReuse,
            snipeAllTokens: botState.settings.snipeAllTokens,
            detectionOnlyMode: botState.settings.detectionOnlyMode
        },
        message: 'Filter settings updated successfully',
        explanation: filterExplanation,
        warnings: [
            ...(botState.settings.snipeAllTokens ? ['⚠️ Snipe All Tokens mode is ACTIVE'] : []),
            ...(!botState.settings.detectionOnlyMode ? ['⚠️ Detection Only mode is OFF - real sniping enabled'] : []),
            ...(botState.settings.snipeAllTokens && !botState.settings.detectionOnlyMode ? ['🚨 DANGER: Will snipe ALL tokens automatically!'] : [])
        ]
    });

    // Broadcast settings update to connected clients
    broadcastToClients({
        type: 'settings_updated',
        data: {
            filterSettings: {
                enableAdminFilter: botState.settings.enableAdminFilter,
                enableCommunityReuse: botState.settings.enableCommunityReuse,
                snipeAllTokens: botState.settings.snipeAllTokens,
                detectionOnlyMode: botState.settings.detectionOnlyMode
            },
            explanation: filterExplanation,
            timestamp: new Date().toISOString()
        }
    });
});

// Enhanced list management routes with Firebase integration
app.get('/api/lists/:listType', async (req, res) => {
    try {
        const { listType } = req.params;

        // Ensure Firebase data is loaded
        if (!botState.isFirebaseLoaded) {
            await botState.loadAdminListsFromFirebase();
        }

        const list = botState.getList(listType);
        res.json({
            list,
            firebaseLoaded: botState.isFirebaseLoaded,
            count: list.length
        });
    } catch (error) {
        console.error('Error fetching list:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/lists/:listType', async (req, res) => {
    try {
        const { listType } = req.params;
        const entry = req.body;

        if (!entry.address && !entry.username) {
            return res.status(400).json({ error: 'Address or username required' });
        }
        if (!entry.amount || !entry.fees) {
            return res.status(400).json({ error: 'Amount and fees required' });
        }

        const config = await botState.addToList(listType, entry);

        // Broadcast update to all connected clients
        broadcastToClients({
            type: 'admin_list_updated',
            data: {
                listType,
                action: 'added',
                entry: config,
                stats: botState.getStats(),
                timestamp: new Date().toISOString()
            }
        });

        res.json({
            success: true,
            config,
            message: `Entry added to ${listType} and saved to Firebase`,
            stats: botState.getStats()
        });
    } catch (error) {
        console.error('Error adding to list:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/lists/:listType/:id', async (req, res) => {
    try {
        const { listType, id } = req.params;
        const success = await botState.removeFromList(listType, id);

        if (success) {
            // Broadcast update to all connected clients
            broadcastToClients({
                type: 'admin_list_updated',
                data: {
                    listType,
                    action: 'removed',
                    entryId: id,
                    stats: botState.getStats(),
                    timestamp: new Date().toISOString()
                }
            });

            res.json({
                success: true,
                message: `Entry removed from ${listType} and Firebase`,
                stats: botState.getStats()
            });
        } else {
            res.status(404).json({ error: 'Entry not found' });
        }
    } catch (error) {
        console.error('Error removing from list:', error);
        res.status(500).json({ error: error.message });
    }
});

// Detected tokens routes
app.get('/api/detected-tokens', (req, res) => {
    const tokens = botState.getDetectedTokens();
    res.json({ tokens });
});

app.delete('/api/detected-tokens', (req, res) => {
    botState.clearDetectedTokens();
    res.json({ success: true, message: 'Detected tokens cleared' });
});

app.post('/api/detected-tokens/:tokenAddress/snipe', async (req, res) => {
    const { tokenAddress } = req.params;

    if (!botState.detectedTokens.has(tokenAddress)) {
        return res.status(404).json({ error: 'Token not found in detected list' });
    }

    const tokenData = botState.detectedTokens.get(tokenAddress);

    if (!tokenData.config) {
        return res.status(400).json({ error: 'No snipe configuration available for this token' });
    }

    try {
        const result = await snipeToken(tokenAddress, tokenData.config);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== DEMO SYSTEM ==========

// Helper functions for demo system
function generateDemoTokenData(template, customWallet = null, customTwitter = null) {
    const randomWallet = customWallet || DEMO_WALLETS[Math.floor(Math.random() * DEMO_WALLETS.length)];
    const randomTokenAddress = generateRandomTokenAddress();
    const randomSignature = generateRandomSignature();
    const randomTwitter = customTwitter || template.twitterHandle;

    const baseData = {
        signature: randomSignature,
        mint: randomTokenAddress,
        traderPublicKey: randomWallet,
        creator: randomWallet,
        txType: "create",
        name: template.name,
        symbol: template.symbol,
        uri: template.uri,
        pool: template.pool,
        solAmount: Math.random() * 5 + 0.01,
        marketCapSol: Math.random() * 50 + 10,
        initialBuy: Math.random() * 100000000,
    };

    if (template.platform === "pumpfun") {
        return {
            ...baseData,
            bondingCurveKey: generateRandomTokenAddress(),
            vTokensInBondingCurve: Math.random() * 1000000000 + 100000000,
            vSolInBondingCurve: Math.random() * 30 + 5,
            metadata: {
                name: template.name,
                symbol: template.symbol,
                twitter: `https://twitter.com/${randomTwitter}`
            }
        };
    } else {
        return {
            ...baseData,
            solInPool: Math.random() * 10 + 1,
            tokensInPool: Math.random() * 1000000000 + 100000000,
            newTokenBalance: Math.random() * 100000000,
            metadata: {
                name: template.name,
                symbol: template.symbol,
                twitter: `https://twitter.com/${randomTwitter}`
            }
        };
    }
}


function generateRandomTokenAddress() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789';
    let result = '';
    for (let i = 0; i < 44; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateRandomSignature() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789';
    let result = '';
    for (let i = 0; i < 88; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

app.post('/api/demo/inject-token', (req, res) => {
    if (!botState.isRunning) {
        return res.status(400).json({ error: 'Bot must be running to inject demo tokens' });
    }

    const {
        templateIndex = 0,
        customWallet = null,
        customTwitter = null,
        customCommunity = null,
        platform = null
    } = req.body;

    let template = DEMO_TOKEN_TEMPLATES[templateIndex];
    if (!template) {
        template = DEMO_TOKEN_TEMPLATES[0];
    }

    if (platform) {
        template = { ...template, platform, pool: platform === 'pumpfun' ? 'pump' : 'bonk' };
    }

    // Generate the demo token data with original twitter handle
    const demoTokenData = generateDemoTokenData(template, customWallet, template.twitterHandle);

    // Override the twitter field AFTER generation
    if (customCommunity) {
        demoTokenData.metadata.twitter = `https://x.com/i/communities/${customCommunity}`;
    } else if (customTwitter) {
        demoTokenData.metadata.twitter = `https://twitter.com/${customTwitter}`;
    }

    console.log(`🧪 DEMO: Injecting token data for ${template.platform}:`, demoTokenData);

    processNewToken(demoTokenData, template.platform);

    res.json({
        success: true,
        message: 'Demo token injected',
        tokenData: demoTokenData
    });
});

app.post('/api/demo/inject-batch', (req, res) => {
    if (!botState.isRunning) {
        return res.status(400).json({ error: 'Bot must be running to inject demo tokens' });
    }

    const { count = 5, delay = 2000 } = req.body;
    let injected = 0;

    const injectNext = () => {
        if (injected >= count) {
            return;
        }

        const templateIndex = Math.floor(Math.random() * DEMO_TOKEN_TEMPLATES.length);
        const template = DEMO_TOKEN_TEMPLATES[templateIndex];
        const demoTokenData = generateDemoTokenData(template);

        console.log(`🧪 DEMO BATCH ${injected + 1}/${count}: Injecting ${template.name}`);
        processNewToken(demoTokenData, template.platform);

        injected++;

        if (injected < count) {
            setTimeout(injectNext, delay);
        }
    };

    injectNext();

    res.json({
        success: true,
        message: `Injecting ${count} demo tokens with ${delay}ms delay`
    });
});

app.get('/api/demo/templates', (req, res) => {
    res.json({
        templates: DEMO_TOKEN_TEMPLATES.map((template, index) => ({
            index,
            name: template.name,
            symbol: template.symbol,
            platform: template.platform,
            twitterHandle: template.twitterHandle
        })),
        wallets: DEMO_WALLETS
    });
});

app.post('/api/demo/inject-from-list', (req, res) => {
    if (!botState.isRunning) {
        return res.status(400).json({ error: 'Bot must be running to inject demo tokens' });
    }

    const { listType, templateIndex = 0 } = req.body;

    let targetWallet = null;
    let targetTwitter = null;

    const list = botState.getList(listType);
    if (list.length === 0) {
        return res.status(400).json({ error: `No entries in ${listType} list` });
    }

    const randomEntry = list[Math.floor(Math.random() * list.length)];

    if (listType.includes('wallets')) {
        targetWallet = randomEntry.address;
    } else {
        targetTwitter = randomEntry.address;
    }

    const template = DEMO_TOKEN_TEMPLATES[templateIndex] || DEMO_TOKEN_TEMPLATES[0];
    const demoTokenData = generateDemoTokenData(template, targetWallet, targetTwitter);

    console.log(`🧪 DEMO FROM LIST: Injecting token with ${listType} entry:`, {
        wallet: targetWallet,
        twitter: targetTwitter,
        tokenName: template.name
    });

    processNewToken(demoTokenData, template.platform);

    res.json({
        success: true,
        message: `Demo token injected using ${listType} entry`,
        usedEntry: randomEntry,
        tokenData: demoTokenData
    });
});

// ADD THESE NEW API ENDPOINTS
app.post('/api/scrape-community/:communityId', async (req, res) => {
    try {
        const { communityId } = req.params;

        if (!twitterScraper.isInitialized) {
            const initSuccess = await twitterScraper.init();
            if (!initSuccess) {
                return res.status(500).json({ error: 'Failed to initialize Twitter scraper' });
            }
        }

        const loginSuccess = await twitterScraper.automaticLogin();
        if (!loginSuccess) {
            return res.status(500).json({ error: 'Failed to login to Twitter' });
        }

        const communityAdmins = await twitterScraper.scrapeCommunityAdmins(communityId);

        res.json({
            success: true,
            communityId: communityId,
            admins: communityAdmins,
            totalAdmins: communityAdmins.length,
            scrapedAt: new Date().toISOString()
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/twitter-scraper-status', (req, res) => {
    res.json({
        initialized: twitterScraper.isInitialized,
        sessionActive: twitterScraper.sessionActive,
        credentialsConfigured: !!(TWITTER_CONFIG.username && TWITTER_CONFIG.password)
    });
});

// Twitter session management endpoints
app.get('/api/twitter-session-status', async (req, res) => {
    try {
        if (!twitterScraper.isInitialized) {
            return res.json({
                initialized: false,
                loggedIn: false,
                message: 'Twitter scraper not initialized'
            });
        }

        const sessionStatus = await twitterScraper.checkSessionStatus();
        res.json({
            initialized: twitterScraper.isInitialized,
            loggedIn: sessionStatus.loggedIn,
            url: sessionStatus.url,
            error: sessionStatus.error,
            message: sessionStatus.loggedIn ? 'Session active' : 'Please login manually'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/twitter-open-login', async (req, res) => {
    try {
        if (!twitterScraper.isInitialized) {
            const initSuccess = await twitterScraper.init();
            if (!initSuccess) {
                return res.status(500).json({ error: 'Failed to initialize browser' });
            }
        }

        const success = await twitterScraper.openLoginPage();
        if (success) {
            res.json({
                success: true,
                message: 'Login page opened. Please login manually in the browser window.'
            });
        } else {
            res.status(500).json({ error: 'Failed to open login page' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== WEBSOCKET CONNECTION HANDLING ==========

wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    wsClients.add(ws);

    ws.send(JSON.stringify({
        type: 'bot_status',
        data: { isRunning: botState.isRunning }
    }));

    ws.on('close', () => {
        console.log('Client disconnected from WebSocket');
        wsClients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        wsClients.delete(ws);
    });
});

// ========== FIREBASE INITIALIZATION ==========

async function initializeFirebaseData() {
    console.log('🔥 Initializing Firebase data...');

    try {
        await testFirebase();
        await botState.loadAdminListsFromFirebase();

        console.log('✅ Firebase initialization complete');
        console.log(`📊 Loaded admin lists:`, botState.getStats());
    } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
    }
}


// ========== ERROR HANDLING ==========

app.use((error, req, res, next) => {
    console.error('Express error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// ========== SERVER STARTUP ==========

server.listen(PORT, async () => {
    console.log(`🚀 DevScope backend running on port ${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
    console.log(`HTTP API endpoint: http://localhost:${PORT}/api`);

    // Initialize Firebase data
    await initializeFirebaseData();
    await ensureSoundsDir(); // ADD THIS LINE

    console.log('🔥 Enhanced Firebase Admin Lists Integration Loaded');
    console.log('🔊 Sound upload system initialized');
    console.log('✅ Features:');
    console.log('  - Firebase storage for Primary/Secondary admin lists');
    console.log('  - Real-time sync between local state and Firebase');
    console.log('  - Automatic data loading on server startup');
    console.log('  - Enhanced statistics with Firebase status');
    console.log('  - Individual Twitter account detection');
    console.log('  - Twitter community detection and tracking');
    console.log('  - Enhanced token page opening on snipe');
    console.log('  - Improved speed optimizations');

    console.log('🧪 Available Firebase endpoints:');
    console.log('  GET /api/firebase/admin-lists - Get all admin lists from Firebase');
    console.log('  POST /api/firebase/sync-admin-lists - Sync admin lists from Firebase');
    console.log('  DELETE /api/firebase/admin-lists/:listType - Clear specific admin list');
    console.log('  GET /api/firebase/used-communities - Fetch used communities');
    console.log('  DELETE /api/firebase/used-communities - Clear all used communities');
    console.log('  GET /api/test-firebase - Test Firebase connection');

    console.log('🎯 Demo data injection system loaded');
    console.log('Available demo endpoints:');
    console.log('  POST /api/demo/inject-token - Inject single demo token');
    console.log('  POST /api/demo/inject-batch - Inject multiple demo tokens');
    console.log('  POST /api/demo/inject-from-list - Inject token matching your lists');
    console.log('  GET /api/demo/templates - Get available demo templates');
});

// ADD GRACEFUL SHUTDOWN
process.on('SIGINT', async () => {
    console.log('\n⏹️ Shutting down gracefully...');

    if (twitterScraper) {
        await twitterScraper.close();
    }

    process.exit(0);
});

module.exports = { app, server, botState };
