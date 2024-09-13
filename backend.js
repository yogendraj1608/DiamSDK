const DiamSdk = require("diamante-sdk-js");
const fetch = require('node-fetch');
const EventSource = require("eventsource");
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const server = new DiamSdk.Horizon.Server("https://diamtestnet.diamcircle.io/");

// Function to prompt user input
async function promptUser(query) {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer);
        });
    });
}

async function createAccount() {
    const pair = DiamSdk.Keypair.random();
    console.log("New Public Key:", pair.publicKey());
    console.log("New Secret Key:", pair.secret());

    const friendbotURL = `https://friendbot.diamcircle.io?addr=${encodeURIComponent(pair.publicKey())}`;
    const response = await fetch(friendbotURL);
    const responseJSON = await response.json();
    console.log("Friendbot Response:", responseJSON);

    return pair;
}

async function loginAccount() {
    try {
        const publicKey = await promptUser("Enter your public key: ");
        const secretKey = await promptUser("Enter your secret key: ");
        const pair = DiamSdk.Keypair.fromSecret(secretKey);

        const account = await server.loadAccount(publicKey);
        console.log("Account Loaded Successfully!");
        return { account, pair };
    } catch (error) {
        console.error("Error loading account:", error);
        return null;
    }
}

// Function Definitions
async function setupTrustline(pair, parentAccount) {
    const assetCode = await promptUser("Enter the asset code (e.g., USD): ");
    const issuerPublicKey = await promptUser("Enter the asset issuer public key: ");
    const asset = new DiamSdk.Asset(assetCode, issuerPublicKey);
    const trustTransaction = new DiamSdk.TransactionBuilder(parentAccount, {
        fee: DiamSdk.BASE_FEE,
        networkPassphrase: DiamSdk.Networks.TESTNET,
    })
        .addOperation(DiamSdk.Operation.changeTrust({
            asset: asset,
        }))
        .setTimeout(180)
        .build();

    trustTransaction.sign(pair);
    const trustResult = await server.submitTransaction(trustTransaction);
    console.log("Trustline Set Successfully!", trustResult);
}

async function issueAsset(pair, parentAccount) {
    const assetCode = await promptUser("Enter the asset code (e.g., USD): ");
    const issuerPublicKey = await promptUser("Enter the asset issuer public key: ");
    const amount = await promptUser("Enter the amount to issue: ");
    const asset = new DiamSdk.Asset(assetCode, issuerPublicKey);
    const issueTransaction = new DiamSdk.TransactionBuilder(parentAccount, {
        fee: DiamSdk.BASE_FEE,
        networkPassphrase: DiamSdk.Networks.TESTNET,
    })
        .addOperation(DiamSdk.Operation.payment({
            destination: pair.publicKey(),
            asset: asset,
            amount: amount,
        }))
        .setTimeout(180)
        .build();

    issueTransaction.sign(pair);
    const issueResult = await server.submitTransaction(issueTransaction);
    console.log("Asset Issued Successfully!", issueResult);
}

async function makePayment(pair, parentAccount) {
    // Prompt the user for the destination account
    const destinationAccount = await promptUser("Enter the destination account public key: ");
    const amount = await promptUser("Enter the amount to pay: ");

    // Build the payment transaction
    const paymentTransaction = new DiamSdk.TransactionBuilder(parentAccount, {
        fee: DiamSdk.BASE_FEE,
        networkPassphrase: DiamSdk.Networks.TESTNET,
    })
        .addOperation(DiamSdk.Operation.payment({
            destination: destinationAccount,
            asset: DiamSdk.Asset.native(),
            amount: amount,
        }))
        .setTimeout(30)
        .build();

    // Sign and submit the transaction
    paymentTransaction.sign(pair);
    try {
        const paymentResult = await server.submitTransaction(paymentTransaction);
        console.log("Payment Successful!", paymentResult);
    } catch (error) {
        console.error("Payment Failed!", error);
    }
}


async function manageBuyOffer(pair, parentAccount) {
    const sellingCode = await promptUser("Enter the asset code you are selling (e.g., XLM): ");
    const sellingIssuer = await promptUser("Enter the asset issuer public key for the selling asset: ");
    const buyingCode = await promptUser("Enter the asset code you are buying (e.g., USD): ");
    const buyingIssuer = await promptUser("Enter the asset issuer public key for the buying asset: ");
    const buyAmount = await promptUser("Enter the amount to buy: ");
    const price = await promptUser("Enter the price per unit: ");
    const offerId = await promptUser("Enter the offer ID (use 0 for a new offer): ");

    const sellingAsset = new DiamSdk.Asset(sellingCode, sellingIssuer);
    const buyingAsset = new DiamSdk.Asset(buyingCode, buyingIssuer);
    const buyOfferTransaction = new DiamSdk.TransactionBuilder(parentAccount, {
        fee: DiamSdk.BASE_FEE,
        networkPassphrase: DiamSdk.Networks.TESTNET,
    })
        .addOperation(DiamSdk.Operation.manageBuyOffer({
            selling: sellingAsset,
            buying: buyingAsset,
            buyAmount: buyAmount,
            price: price,
            offerId: parseInt(offerId),
        }))
        .setTimeout(180)
        .build();

    buyOfferTransaction.sign(pair);
    const buyOfferResult = await server.submitTransaction(buyOfferTransaction);
    console.log("Buy Offer Successful!", buyOfferResult);
}

async function manageSellOffer(pair, parentAccount) {
    const sellingCode = await promptUser("Enter the asset code you are selling (e.g., USD): ");
    const sellingIssuer = await promptUser("Enter the asset issuer public key for the selling asset: ");
    const buyingCode = await promptUser("Enter the asset code you are buying (e.g., XLM): ");
    const buyingIssuer = await promptUser("Enter the asset issuer public key for the buying asset: ");
    const amount = await promptUser("Enter the amount to sell: ");
    const price = await promptUser("Enter the price per unit: ");
    const offerId = await promptUser("Enter the offer ID (use 0 for a new offer): ");

    const sellingAsset = new DiamSdk.Asset(sellingCode, sellingIssuer);
    const buyingAsset = new DiamSdk.Asset(buyingCode, buyingIssuer);
    const sellOfferTransaction = new DiamSdk.TransactionBuilder(parentAccount, {
        fee: DiamSdk.BASE_FEE,
        networkPassphrase: DiamSdk.Networks.TESTNET,
    })
        .addOperation(DiamSdk.Operation.manageSellOffer({
            selling: sellingAsset,
            buying: buyingAsset,
            amount: amount,
            price: price,
            offerId: parseInt(offerId),
        }))
        .setTimeout(180)
        .build();

    sellOfferTransaction.sign(pair);
    const sellOfferResult = await server.submitTransaction(sellOfferTransaction);
    console.log("Sell Offer Successful!", sellOfferResult);
}

function streamPayments(pair) {
    const es = new EventSource(`https://diamtestnet.diamcircle.io/accounts/${pair.publicKey()}/payments`);
    es.onmessage = function (message) {
        const result = message.data ? JSON.parse(message.data) : message;
        console.log("New payment:");
        console.log(result);
    };
    es.onerror = function (error) {
        console.log("An error occurred!");
    };
}

async function handlePreconditions(pair, parentAccount) {
    const minTime = await promptUser("Enter the minimum time (UNIX timestamp): ");
    const maxTime = await promptUser("Enter the maximum time (UNIX timestamp): ");
    const amount = await promptUser("Enter the amount to send: ");

    const preconditionTransaction = new DiamSdk.TransactionBuilder(parentAccount, {
        fee: DiamSdk.BASE_FEE,
        networkPassphrase: DiamSdk.Networks.TESTNET,
        timebounds: {
            minTime: parseInt(minTime),
            maxTime: parseInt(maxTime),
        }
    })
        .addOperation(DiamSdk.Operation.payment({
            destination: pair.publicKey(),
            asset: DiamSdk.Asset.native(),
            amount: amount,
        }))
        .setTimeout(180)
        .build();

    preconditionTransaction.sign(pair);
    const preconditionResult = await server.submitTransaction(preconditionTransaction);
    console.log("Precondition Transaction Successful!", preconditionResult);
}

async function pathfinding(pair) {
    const destinationAmount = await promptUser("Enter the amount to find a path for: ");
    const paths = await server.paths()
        .sourceAccount(pair.publicKey())
        .destinationAccount(pair.publicKey())
        .destinationAsset(DiamSdk.Asset.native())
        .destinationAmount(destinationAmount)
        .call();
    console.log("Pathfinding Result:", paths);
}

async function paymentChannel(pair) {
    const receiverPublicKey = await promptUser("Enter the recipient public key: ");
    const startingBalanceA = await promptUser("Enter the starting balance for client A: ");
    const startingBalanceB = await promptUser("Enter the starting balance for client B: ");
    const amountToSend = await promptUser("Enter the amount to send: ");

    const paymentChannel = new DiamSdk.Starlight.PaymentChannel({
        server: server,
        clientASecret: pair.secret(),
        clientBPublic: receiverPublicKey,
    });

    await paymentChannel.open({
        startingBalanceA: startingBalanceA,
        startingBalanceB: startingBalanceB,
    });

    await paymentChannel.send(amountToSend);
    await paymentChannel.close();

    console.log("Payment Channel Transaction Complete");
}

// New Function Definitions
async function manageVotingTokens(pair, parentAccount) {
    const tokenName = await promptUser("Enter the voting token name: ");
    const action = await promptUser("Enter the action (issue, tally): ");

    if (action === 'issue') {
        const amount = await promptUser("Enter the amount to issue: ");
        const issueTransaction = new DiamSdk.TransactionBuilder(parentAccount, {
            fee: DiamSdk.BASE_FEE,
            networkPassphrase: DiamSdk.Networks.TESTNET,
        })
            .addOperation(DiamSdk.Operation.payment({
                destination: pair.publicKey(),
                asset: new DiamSdk.Asset(tokenName, parentAccount.publicKey()),
                amount: amount,
            }))
            .setTimeout(180)
            .build();

        issueTransaction.sign(pair);
        const issueResult = await server.submitTransaction(issueTransaction);
        console.log("Voting Token Issued Successfully!", issueResult);
    } else if (action === 'tally') {
        // Implement tally logic
        console.log("Tallying votes...");
    } else {
        console.log("Invalid action.");
    }
}

async function mintNFT(pair, parentAccount) {
    const nftName = await promptUser("Enter the NFT name: ");
    const nftData = await promptUser("Enter the NFT metadata: ");

    // Implement NFT minting logic
    console.log("Minting NFT:", nftName, "with metadata:", nftData);
}

async function manageDeFi(pair, parentAccount) {
    const action = await promptUser("Enter the DeFi action (liquidity, borrow, yield): ");

    if (action === 'liquidity') {
        // Implement liquidity provision logic
        console.log("Providing liquidity...");
    } else if (action === 'borrow') {
        // Implement borrowing logic
        console.log("Borrowing...");
    } else if (action === 'yield') {
        // Implement yield farming logic
        console.log("Yield farming...");
    } else {
        console.log("Invalid action.");
    }
}

async function tokenizeRealEstate(pair, parentAccount) {
    const propertyDetails = await promptUser("Enter the property details: ");
    // Implement real estate tokenization logic
    console.log("Tokenizing real estate:", propertyDetails);
}

async function manageTokenSwaps(pair, parentAccount) {
    const fromAssetCode = await promptUser("Enter the asset code you are swapping from: ");
    const toAssetCode = await promptUser("Enter the asset code you are swapping to: ");
    const amount = await promptUser("Enter the amount to swap: ");

    // Implement token swap logic
    console.log(`Swapping ${amount} ${fromAssetCode} for ${toAssetCode}`);
}

async function manageCrowdfunding(pair, parentAccount) {
    const campaignAction = await promptUser("Enter the crowdfunding action (create, contribute): ");

    if (campaignAction === 'create') {
        const campaignDetails = await promptUser("Enter the campaign details: ");
        // Implement campaign creation logic
        console.log("Creating crowdfunding campaign:", campaignDetails);
    } else if (campaignAction === 'contribute') {
        const amount = await promptUser("Enter the contribution amount: ");
        // Implement contribution logic
        console.log("Contributing to campaign with amount:", amount);
    } else {
        console.log("Invalid action.");
    }
}

async function manageDigitalIdentity(pair, parentAccount) {
    const action = await promptUser("Enter the digital identity action (create, verify): ");

    if (action === 'create') {
        const identityDetails = await promptUser("Enter the identity details: ");
        // Implement identity creation logic
        console.log("Creating digital identity:", identityDetails);
    } else if (action === 'verify') {
        const identityId = await promptUser("Enter the identity ID to verify: ");
        // Implement identity verification logic
        console.log("Verifying digital identity:", identityId);
    } else {
        console.log("Invalid action.");
    }
}

async function manageELearning(pair, parentAccount) {
    const action = await promptUser("Enter the e-learning action (createCourse, issueCertificate): ");

    if (action === 'createCourse') {
        const courseDetails = await promptUser("Enter the course details: ");
        // Implement course creation logic
        console.log("Creating e-learning course:", courseDetails);
    } else if (action === 'issueCertificate') {
        const studentName = await promptUser("Enter the student's name: ");
        const courseName = await promptUser("Enter the course name: ");
        // Implement certificate issuance logic
        console.log(`Issuing certificate for ${studentName} for ${courseName}`);
    } else {
        console.log("Invalid action.");
    }
}

async function manageLoyaltyProgram(pair, parentAccount) {
    const action = await promptUser("Enter the loyalty program action (create, redeem): ");

    if (action === 'create') {
        const programDetails = await promptUser("Enter the loyalty program details: ");
        // Implement loyalty program creation logic
        console.log("Creating loyalty program:", programDetails);
    } else if (action === 'redeem') {
        const points = await promptUser("Enter the points to redeem: ");
        // Implement points redemption logic
        console.log("Redeeming loyalty points:", points);
    } else {
        console.log("Invalid action.");
    }
}

async function manageP2PLending(pair, parentAccount) {
    const action = await promptUser("Enter the P2P lending action (lend, borrow): ");

    if (action === 'lend') {
        const amount = await promptUser("Enter the amount to lend: ");
        // Implement lending logic
        console.log("Lending amount:", amount);
    } else if (action === 'borrow') {
        const amount = await promptUser("Enter the amount to borrow: ");
        // Implement borrowing logic
        console.log("Borrowing amount:", amount);
    } else {
        console.log("Invalid action.");
    }
}

async function manageDigitalArt(pair, parentAccount) {
    const action = await promptUser("Enter the digital art action (create, auction): ");

    if (action === 'create') {
        const artDetails = await promptUser("Enter the digital art details: ");
        // Implement digital art creation logic
        console.log("Creating digital art:", artDetails);
    } else if (action === 'auction') {
        const auctionDetails = await promptUser("Enter the auction details: ");
        // Implement auction logic
        console.log("Starting auction with details:", auctionDetails);
    } else {
        console.log("Invalid action.");
    }
}

async function managePredictionMarket(pair, parentAccount) {
    const action = await promptUser("Enter the prediction market action (create, trade): ");

    if (action === 'create') {
        const marketDetails = await promptUser("Enter the market details: ");
        // Implement market creation logic
        console.log("Creating prediction market:", marketDetails);
    } else if (action === 'trade') {
        const tradeDetails = await promptUser("Enter the trade details: ");
        // Implement trading logic
        console.log("Trading in prediction market with details:", tradeDetails);
    } else {
        console.log("Invalid action.");
    }
}

async function manageContentModeration(pair, parentAccount) {
    const action = await promptUser("Enter the content moderation action (review, ban): ");

    if (action === 'review') {
        const contentId = await promptUser("Enter the content ID to review: ");
        // Implement content review logic
        console.log("Reviewing content with ID:", contentId);
    } else if (action === 'ban') {
        const userId = await promptUser("Enter the user ID to ban: ");
        // Implement user banning logic
        console.log("Banning user with ID:", userId);
    } else {
        console.log("Invalid action.");
    }
}

async function tradeGreenEnergy(pair, parentAccount) {
    const action = await promptUser("Enter the green energy action (buy, sell): ");

    if (action === 'buy') {
        const amount = await promptUser("Enter the amount of green energy to buy: ");
        // Implement green energy buying logic
        console.log("Buying green energy:", amount);
    } else if (action === 'sell') {
        const amount = await promptUser("Enter the amount of green energy to sell: ");
        // Implement green energy selling logic
        console.log("Selling green energy:", amount);
    } else {
        console.log("Invalid action.");
    }
}

async function manageIntellectualProperty(pair, parentAccount) {
    const action = await promptUser("Enter the intellectual property action (register, transfer): ");

    if (action === 'register') {
        const ipDetails = await promptUser("Enter the IP details to register: ");
        // Implement IP registration logic
        console.log("Registering intellectual property:", ipDetails);
    } else if (action === 'transfer') {
        const ipId = await promptUser("Enter the IP ID to transfer: ");
        const newOwner = await promptUser("Enter the new owner's public key: ");
        // Implement IP transfer logic
        console.log(`Transferring intellectual property ID ${ipId} to new owner ${newOwner}`);
    } else {
        console.log("Invalid action.");
    }
}

async function userPrompt(pair, parentAccount) {
    let continueLoop = true;
    while (continueLoop) {
        const choice = await promptUser(`Select an operation to perform:
        1: Set up a trustline
        2: Issue an asset
        3: Make a payment
        4: Manage buy offer
        5: Manage sell offer
        6: Stream payments
        7: Handle preconditions
        8: Pathfinding
        9: Payment channel
        10: Manage voting tokens
        11: Mint NFT
        12: Manage DeFi
        13: Tokenize real estate
        14: Manage token swaps
        15: Manage crowdfunding
        16: Manage digital identity
        17: Manage e-learning
        18: Manage loyalty program
        19: Manage P2P lending
        20: Manage digital art
        21: Manage prediction market
        22: Manage content moderation
        23: Trade green energy
        24: Manage intellectual property
        0: Exit\n`);

        switch (parseInt(choice)) {
            case 1:
                await setupTrustline(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 2:
                await issueAsset(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 3:
                await makePayment(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 4:
                await manageBuyOffer(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 5:
                await manageSellOffer(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 6:
                streamPayments(pair);
                break;
            case 7:
                await handlePreconditions(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 8:
                await pathfinding(pair);
                break;
            case 9:
                await paymentChannel(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 10:
                await manageVotingTokens(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 11:
                await mintNFT(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 12:
                await manageDeFi(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 13:
                await tokenizeRealEstate(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 14:
                await manageTokenSwaps(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 15:
                await manageCrowdfunding(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 16:
                await manageDigitalIdentity(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 17:
                await manageELearning(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 18:
                await manageLoyaltyProgram(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 19:
                await manageP2PLending(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 20:
                await manageDigitalArt(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 21:
                await managePredictionMarket(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 22:
                await manageContentModeration(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 23:
                await tradeGreenEnergy(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 24:
                await manageIntellectualProperty(pair, await server.loadAccount(pair.publicKey()));
                break;
            case 0:
                continueLoop = false;
                rl.close();
                console.log("Exiting...");
                break;
            default:
                console.log("Invalid choice. Please try again.");
        }
    }
}

// Main execution
(async () => {
    console.log("Welcome to the Diamante CLI");
    const action = await promptUser("Do you want to create a new account or login? (create/login): ");
    let pair;
    let parentAccount;

    if (action === 'create') {
        pair = await createAccount();
    } else if (action === 'login') {
        const loginResult = await loginAccount();
        if (loginResult) {
            pair = loginResult.pair;
            parentAccount = loginResult.account;
        } else {
            console.log("Login failed.");
            return;
        }
    } else {
        console.log("Invalid action.");
        return;
    }

    await userPrompt(pair, parentAccount);
})();
