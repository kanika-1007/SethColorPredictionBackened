const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

let usersCollection, addMoneyRequestsCollection,upiIdCollection;

router.use((req, res, next) => {
    if (!usersCollection || !addMoneyRequestsCollection) {
        console.error("Add Money routes: Database not initialized."); // Debug log
        return res.status(500).json({ message: 'Database not initialized.' });
    }
    next();
});

const setCollections = (users, addMoneyRequests, upiIdColl) => {
    usersCollection = users;
    addMoneyRequestsCollection = addMoneyRequests;
    upiIdCollection = upiIdColl;
    console.log("Add Money routes: Collections initialized."); // Debug log
};


// Update UPI ID
router.post('/update-upi-id', async (req, res) => {
    const { newUpiId } = req.body;

    if (!newUpiId) {
        return res.status(400).json({ message: 'UPI ID is required.' });
    }

    try {
        // Update the UPI ID or insert it if not present
        await upiIdCollection.updateOne(
            { key: 'upiId' },
            { $set: { value: newUpiId } },
            { upsert: true }
        );
        res.status(200).json({ message: 'UPI ID updated successfully.' });
    } catch (err) {
        console.error('Error updating UPI ID:', err);
        res.status(500).json({ message: 'Failed to update UPI ID.' });
    }
});

// Get current UPI ID
router.get('/current-upi-id', async (req, res) => {
    try {
        const upiIdEntry = await upiIdCollection.findOne({ key: 'upiId' });
        const currentUpiId = upiIdEntry ? upiIdEntry.value : '';
        res.status(200).json({ upiId: currentUpiId });
    } catch (err) {
        console.error('Error fetching UPI ID:', err);
        res.status(500).json({ message: 'Failed to fetch UPI ID.' });
    }
});

// Fetch balance
router.get('/balance/:username', async (req, res) => {
    const { username } = req.params;
    console.log(`[Balance] Fetching balance for username: ${username}`); // Log username

    if (!username) {
        console.log('[Balance] Missing username');
        return res.status(400).json({ message: 'Username is required.' });
    }

    try {
        const user = await usersCollection.findOne({ username });
        if (!user) {
            console.log(`[Balance] User not found: ${username}`);
            return res.status(404).json({ message: 'User not found.' });
        }

        console.log(`[Balance] User found: ${JSON.stringify(user)}`); // Debug user data
        res.status(200).json({ balance: user.balance || 0 });
    } catch (err) {
        console.error('[Balance] Error fetching balance:', err);
        res.status(500).json({ message: 'Failed to fetch balance.' });
    }
});

// Submit add money request
router.post('/request', async (req, res) => {
    const { username, amount, utr, paymentType } = req.body;

    if (!username || !amount || !utr || !paymentType) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    try {
        await addMoneyRequestsCollection.insertOne({
            username,
            amount,
            utr,
            paymentType,
            status: 'Pending',
            date: new Date(),
        });

        res.status(201).json({ message: 'Request submitted successfully.' });
    } catch (err) {
        console.error('Error submitting request:', err);
        res.status(500).json({ message: 'Failed to submit request.' });
    }
});

router.get('/requests/all', async (req, res) => {

    try {
        const requests = await addMoneyRequestsCollection.find({}).toArray();
        res.status(200).json(requests);
    } catch (err) {
        console.error('[Requests] Error fetching requests:', err);
        res.status(500).json({ message: 'Failed to fetch requests.' });
    }
});


// Approve or reject request (Admin)
router.post('/approve', async (req, res) => {
    const { requestId, action } = req.body;

    if (!requestId || !action) {
        return res.status(400).json({ message: 'Request ID and action are required.' });
    }

    try {
        const request = await addMoneyRequestsCollection.findOne({ _id: new ObjectId(requestId) });

        if (!request) {
            return res.status(404).json({ message: 'Request not found.' });
        }

        if (action === 'Approve') {
            await usersCollection.updateOne(
                { username: request.username },
                { $inc: { balance: request.amount } } // Increment balance by the requested amount
            );
        }

        await addMoneyRequestsCollection.updateOne(
            { _id: new ObjectId(requestId) },
            { $set: { status: action } }
        );

        res.status(200).json({ message: `Request ${action.toLowerCase()}d successfully.` });
    } catch (err) {
        console.error('Error updating request:', err);
        res.status(500).json({ message: 'Failed to process the request.' });
    }
});

module.exports = { router, setCollections };
