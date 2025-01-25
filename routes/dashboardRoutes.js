const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

let usersCollection, resultsCollection, globalDataCollection, activeBetsCollection;

router.use((req, res, next) => {
    if (!usersCollection || !resultsCollection || !globalDataCollection || !activeBetsCollection) {
        console.error("Dashboard routes: Database not initialized."); // Add a log
        return res.status(500).json({ message: 'Database not initialized.' });
    }
    next();
});

const setCollections = (users, results, globalData, activeBets) => {
    usersCollection = users;
    resultsCollection = results;
    globalDataCollection = globalData;
    activeBetsCollection = activeBets;
    console.log("Dashboard routes: Collections initialized."); // Debug log
};

// Initialize global state for the timer
let globalTimer = { timeLeft: 35, currentBetNumber: 1 }; // Default state
const updateTimer = async () => {
    // Ensure the globalDataCollection is available before running
    if (!globalDataCollection) {
        console.error("globalDataCollection is not initialized.");
        return;  // Prevent the timer from running if collection isn't available
    }

    // Decrease time by 1 second
    if (globalTimer.timeLeft > 0) {
        globalTimer.timeLeft -= 1;
    } else {
        // When the timer reaches 0, move to the next bet number
        globalTimer.timeLeft = 35; // Reset timer to 35 seconds
        globalTimer.currentBetNumber += 1; // Increment bet number
    }

    try {
        // Store the updated timer state and bet number in the database
        await globalDataCollection.updateOne(
            { key: 'timeLeft' },
            { $set: { value: globalTimer.timeLeft } },
            { upsert: true } // Create entry if not exists
        );

        await globalDataCollection.updateOne(
            { key: 'currentBetNumber' },
            { $set: { value: globalTimer.currentBetNumber } },
            { upsert: true } // Create entry if not exists
        );
    } catch (err) {
        console.error('Error updating timer state:', err);
    }
};

// Start timer only after the collections are set
const startTimer = () => {
    if (globalDataCollection) {
        setInterval(updateTimer, timerInterval); // Only start after collections are set
        console.log("Timer started successfully!");
    } else {
        console.error("Error: globalDataCollection is not available.");
    }
};

// Only start the timer after the collections have been initialized
router.post('/start-timer', (req, res) => {
    startTimer(); // Start the timer when this endpoint is hit (or when collections are set)
    res.status(200).json({ message: "Timer started." });
});

// Manual result state (for manual bets)
let manualResultState = {
    isManualResultEnabled: false,
    selectedColor: null,
};

router.get('/manual-result-state', (req, res) => {
    res.status(200).json(manualResultState);
});

router.post('/manual-result-state', (req, res) => {
    const { isManualResultEnabled, selectedColor } = req.body;
    manualResultState.isManualResultEnabled = isManualResultEnabled;
    manualResultState.selectedColor = selectedColor;
    res.status(200).json({ message: 'Manual result state updated successfully.' });
});

// Fetch current timer state (remaining time and current bet number)
router.get('/timer-state', async (req, res) => {
    try {
        const timeLeftData = await globalDataCollection.findOne({ key: 'timeLeft' });
        const timeLeft = timeLeftData?.value || 35; // Default to 35 seconds if not found

        const betNumberData = await globalDataCollection.findOne({ key: 'currentBetNumber' });
        const currentBetNumber = betNumberData?.value || 1; // Default to 1 if not found

        res.status(200).json({ timeLeft, currentBetNumber });
    } catch (err) {
        console.error('Error fetching timer state:', err);
        res.status(500).json({ message: 'Failed to retrieve timer state.' });
    }
});

// Update current timer state (timeLeft and currentBetNumber)
router.post('/update-timer-state', async (req, res) => {
    const { timeLeft, currentBetNumber } = req.body;

    try {
        await globalDataCollection.updateOne(
            { key: 'timeLeft' },
            { $set: { value: timeLeft } },
            { upsert: true }
        );

        await globalDataCollection.updateOne(
            { key: 'currentBetNumber' },
            { $set: { value: currentBetNumber } },
            { upsert: true }
        );

        res.status(200).json({ message: 'Timer state updated.' });
    } catch (err) {
        console.error('Error updating timer state:', err);
        res.status(500).json({ message: 'Failed to update timer state.' });
    }
});

// Reset the timer (e.g., manually triggered)
router.post('/reset-timer', (req, res) => {
    globalTimer = { timeLeft: 35, currentBetNumber: globalTimer.currentBetNumber + 1 };
    res.status(200).json({ message: 'Timer reset.' });
});

// Add active bet (admin)
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

// Fetch active bets based on the current bet number
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

// Fetch and update player history (bet history)
router.get('/player-history/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const user = await usersCollection.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const playerHistory = user.playerHistory || [];
        res.status(200).json({ playerHistory });
    } catch (err) {
        console.error('Error fetching player history:', err);
        res.status(500).json({ message: 'Failed to retrieve player history.' });
    }
});

router.post('/player-history', async (req, res) => {
    const { username, historyEntry } = req.body;
    try {
        const result = await usersCollection.updateOne(
            { username },
            { $push: { playerHistory: historyEntry } }
        );
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
