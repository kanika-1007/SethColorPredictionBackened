const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

let usersCollection, resultsCollection, globalDataCollection,activeBetsCollection;

router.use((req, res, next) => {
    if (!usersCollection || !resultsCollection || !globalDataCollection|| !activeBetsCollection) {
        console.error("Dashboard routes: Database not initialized."); // Add a log
        return res.status(500).json({ message: 'Database not initialized.' });
    }
    next();
});

const setCollections = (users, results, globalData,activeBets) => {
    usersCollection = users;
    resultsCollection = results;
    globalDataCollection = globalData;
    activeBetsCollection = activeBets;
    console.log("Dashboard routes: Collections initialized."); // Debug log
};

let globalTimer = { timeLeft: 35, currentBetNumber: 1 }; // Initialize global state
let manualResultState = {
    isManualResultEnabled: false,
    selectedColor: null,
};
// Function to update the timer every second
setInterval(() => {
    globalTimer.timeLeft--;
    if (globalTimer.timeLeft <= 0) {
        // Reset or perform necessary actions when the timer finishes
        globalTimer.timeLeft = 35;
    }

    // Update the timer state in the database or in-memory for clients to fetch
    // Here we're simulating sending the updated timer to clients
    io.emit('timer-update', globalTimer); // Emit via WebSocket or update API
}, 1000);

// Endpoint to fetch the manual result state
router.get('/manual-result-state', (req, res) => {
    res.status(200).json(manualResultState);
});

// Endpoint to update the manual result state
router.post('/manual-result-state', (req, res) => {
    const { isManualResultEnabled, selectedColor } = req.body;
    manualResultState.isManualResultEnabled = isManualResultEnabled;
    manualResultState.selectedColor = selectedColor;
    res.status(200).json({ message: 'Manual result state updated successfully.' });
});


// Set Manual Result State
router.post('/set-manual-result', (req, res) => {
    const { isManualResultEnabled, selectedColor } = req.body;
    manualResultState = { isManualResultEnabled, selectedColor };
    res.status(200).json({ message: 'Manual result state updated.' });
});

// Fetch current timer state
router.get('/timer-state', (req, res) => {
    res.status(200).json(globalTimer);
});

// Update timer state
router.post('/update-timer-state', (req, res) => {
    const { timeLeft, currentBetNumber } = req.body;
    globalTimer = { timeLeft, currentBetNumber };
    res.status(200).json({ message: 'Timer state updated.' });
});

// Reset timer (if needed)
router.post('/reset-timer', (req, res) => {
    globalTimer = { timeLeft: 35, currentBetNumber: globalTimer.currentBetNumber + 1 };
    res.status(200).json({ message: 'Timer reset.' });
});

router.post('/active-bets', async (req, res) => {
    const { betNo, betBlock, betAmount } = req.body;

    try {
        await activeBetsCollection.insertOne({ betNo, betBlock, betAmount });
        res.status(201).json({ message: 'Bet saved for admin.' });
    } catch (err) {
        console.error('Error saving active bet:', err);
        res.status(500).json({ message: 'Failed to save bet for admin.' });
    }
});

router.get('/active-bets/:currentBetNumber', async (req, res) => {
    const currentBetNumber = parseInt(req.params.currentBetNumber);

    try {
        const activeBets = await activeBetsCollection.find({ betNo: currentBetNumber }).toArray();
        res.status(200).json(activeBets);
    } catch (err) {
        console.error('Error fetching active bets:', err);
        res.status(500).json({ message: 'Failed to fetch active bets.' });
    }
});

// Fetch player history
router.get('/player-history/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const user = await usersCollection.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const playerHistory = user.playerHistory || [];
        res.status(200).json({ playerHistory});
    } catch (err) {
        console.error('Error fetching player history:', err);
        res.status(500).json({ message: 'Failed to retrieve player history.' });
    }
});


// Add player bet entry
router.post('/player-history', async (req, res) => {
    console.log("Incoming request:", req.body); // Debug log
    const { username, historyEntry } = req.body;

    try {
        const result = await usersCollection.updateOne(
            { username },
            { $push: { playerHistory: historyEntry } }
        );
        console.log("Update result:", result); // Debug log
        if (result.matchedCount > 0) {
            res.status(200).json({ message: 'Player history updated.' });
        } else {
            res.status(404).json({ message: 'User not found.' });
        }
    } catch (err) {
        console.error('Error updating player history:', err);
        res.status(500).json({ message: 'Failed to update player history.' });
    }
});


// Fetch global result history
router.get('/result-history', async (req, res) => {
    try {
        const results = await resultsCollection.find({}).toArray();
        res.status(200).json(results);
    } catch (err) {
        res.status(500).json({ message: 'Failed to retrieve result history.' });
    }
});

// Add global bet result
router.post('/result-history', async (req, res) => {
    const { resultEntry } = req.body;
    try {
        // Check if the result with the same bet number already exists
        const existingResult = await resultsCollection.findOne({ betNumber: resultEntry.betNumber });
        if (existingResult) {
            return res.status(400).json({ message: 'Duplicate bet number detected.' });
        }
        await resultsCollection.insertOne(resultEntry);
        res.status(200).json({ message: 'Result history updated.' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update result history.' });
    }
});

// Fetch current bet number
router.get('/current-bet-number', async (req, res) => {
    try {
        const globalData = await globalDataCollection.findOne({ key: 'currentBetNumber' });
        res.status(200).json({ currentBetNumber: globalData?.value || 1 });
    } catch (err) {
        res.status(500).json({ message: 'Failed to retrieve the current bet number.' });
    }
});

// Update current bet number
router.post('/update-bet-number', async (req, res) => {
    const { currentBetNumber } = req.body;
    try {
        await globalDataCollection.updateOne(
            { key: 'currentBetNumber' },
            { $set: { value: currentBetNumber } },
            { upsert: true }
        );
        res.status(200).json({ message: 'Current bet number updated.' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update the current bet number.' });
    }
});

// Update player history by fetching all current rows (if needed)
router.put('/update-player-history', async (req, res) => {
    const { username, historyEntries } = req.body;

    try {
        const result = await usersCollection.updateOne(
            { username },
            { $set: { playerHistory: historyEntries } } // Overwrite history with new data
        );
        if (result.matchedCount > 0) {
            res.status(200).json({ message: 'Player history replaced with updated entries.' });
        } else {
            res.status(404).json({ message: 'User not found.' });
        }
    } catch (err) {
        console.error('Error replacing player history:', err);
        res.status(500).json({ message: 'Failed to replace player history.' });
    }
});

// Fetch user balance
router.get('/balance/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const user = await usersCollection.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.status(200).json({ balance: user.balance });
    } catch (err) {
        console.error('Error fetching balance:', err);
        res.status(500).json({ message: 'Failed to fetch balance.' });
    }
});

// Update user balance
router.post('/balance', async (req, res) => {
    const { username, balance } = req.body;
    try {
        const result = await usersCollection.updateOne(
            { username },
            { $set: { balance: parseFloat(balance) } }
        );
        if (result.matchedCount > 0) {
            res.status(200).json({ message: 'Balance updated.' });
        } else {
            res.status(404).json({ message: 'User not found.' });
        }
    } catch (err) {
        console.error('Error updating balance:', err);
        res.status(500).json({ message: 'Failed to update balance.' });
    }
});

module.exports = { router, setCollections };
