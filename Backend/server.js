// ========== COMPLETE FIXED SERVER.JS WITH FIREBASE ADMIN LISTS ==========

const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const dotenv = require('dotenv');
const admin = require('firebase-admin');

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

// ========== ORIGINAL BOTSTATE CLASS ==========

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
            address: entry.address || entry.username,
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
        for (const config of this.primaryAdminList.values()) {
            if (config.address === identifier) {
                return config;
            }
        }
        return null;
    }

    checkAdminInSecondary(identifier) {
        for (const config of this.secondaryAdminList.values()) {
            if (config.address === identifier) {
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
            address: entry.address || entry.username,
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
        const handle = cleanInput.substring(1).toLowerCase();
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
        const handle = cleanInput.toLowerCase();
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

        // Generate token page URL based on settings
        const tokenPageUrl = getTokenPageUrl(tokenAddress, botState.settings.tokenPageDestination);

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

function getTokenPageUrl(tokenAddress, destination) {
    switch (destination) {
        case 'neo_bullx':
            return `https://neo.bullx.io/terminal?chainId=1399811149&address=${tokenAddress}`;
        case 'axiom':
            return `https://axiom.trade/token/${tokenAddress}`;
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

        // 1. Check Twitter Community/Individual Admin matching
        if (twitterData.admin) {
            // Handle Twitter communities
            if (twitterData.type === 'community') {
                console.log(`🏘️ Found Twitter community: ${twitterData.id}`);

                // Check for community reuse if enabled
                if (botState.settings.enableCommunityReuse) {
                    const communityUsedInFirebase = await isCommunityUsedInFirebase(twitterData.id);
                    if (communityUsedInFirebase) {
                        console.log(`❌ Community ${twitterData.id} already used (Firebase), skipping due to Prevent Community Reuse setting`);
                        return;
                    }
                } else {
                    console.log(`🔄 Community reuse allowed - Prevent Community Reuse is disabled`);
                }

                // Check if community ID is in primary admins list
                const primaryAdminConfig = botState.checkAdminInPrimary(twitterData.id);
                if (primaryAdminConfig) {
                    console.log(`✅ Community ${twitterData.id} found in primary admin list!`);

                    const detectedTokenData = {
                        ...completeTokenData,
                        matchType: 'primary_admin',
                        matchedEntity: `Community ${twitterData.id}`,
                        detectionReason: `Primary Community: ${twitterData.id}`,
                        config: primaryAdminConfig
                    };

                    botState.addDetectedToken(tokenAddress, detectedTokenData);
                    await markCommunityAsUsedInFirebase(twitterData.id, completeTokenData);

                    broadcastToClients({
                        type: 'token_detected',
                        data: detectedTokenData
                    });

                    if (!botState.settings.detectionOnlyMode) {
                        await snipeToken(tokenAddress, primaryAdminConfig);
                    }
                    return;
                }

                // Check secondary admins list for community
                const secondaryAdminConfig = botState.checkAdminInSecondary(twitterData.id);
                if (secondaryAdminConfig) {
                    console.log(`🔔 Community ${twitterData.id} found in secondary admin list!`);

                    const detectedTokenData = {
                        ...completeTokenData,
                        matchType: 'secondary_admin',
                        matchedEntity: `Community ${twitterData.id}`,
                        detectionReason: `Secondary Community: ${twitterData.id}`,
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

            // Handle individual Twitter accounts
            else if (twitterData.type === 'individual') {
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
        }

        // 2. CONSOLIDATED WALLET ADDRESS CHECKING (moved from wallet filtering to admin filtering)
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

        broadcastToClients({
            type: 'token_detected',
            data: detectedTokenData
        });
        return;
    }

    console.log(`❌ Token ${tokenAddress} doesn't match any criteria`);

    // Log tokens that don't match for debugging
    if (twitterData.type || creatorWallet) {
        console.log(`📝 Token ${tokenAddress} has data but no matches:`, {
            name: completeTokenData.name,
            symbol: completeTokenData.symbol,
            twitterType: twitterData.type,
            twitterData: twitterData,
            creatorWallet: creatorWallet
        });
    }
}

// ========== API ENDPOINTS ==========

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
    
    console.log('🔥 Enhanced Firebase Admin Lists Integration Loaded');
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

module.exports = { app, server, botState };
