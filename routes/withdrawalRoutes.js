const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

let usersCollection, withdrawalRequestsCollection;

// Middleware to ensure collections are initialized
router.use((req, res, next) => {
    if (!usersCollection || !withdrawalRequestsCollection) {
        return res.status(500).json({ message: 'Database not initialized.' });
    }
    next();
});

// Initialize collections
const setCollections = (users, withdrawalRequests) => {
    usersCollection = users;
    withdrawalRequestsCollection = withdrawalRequests;
    console.log("Withdrawl routes: Collections initialized."); // Debug log
};

// Fetch balance
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

// Submit withdrawal request
router.post('/request', async (req, res) => {
    const { username, amount, method, details } = req.body;

    if (!username || !amount || !method || !details) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    try {
        const user = await usersCollection.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (amount > user.balance) {
            return res.status(400).json({ message: 'Insufficient balance.' });
        }

        await withdrawalRequestsCollection.insertOne({
            username,
            amount,
            method,
            details,
            status: 'Pending',
            date: new Date(),
        });

        await usersCollection.updateOne(
            { username },
            { $inc: { balance: -amount } }
        );

        res.status(201).json({ message: 'Withdrawal request submitted successfully.' });
    } catch (err) {
        console.error('Error submitting withdrawal request:', err);
        res.status(500).json({ message: 'Failed to submit request.' });
    }
});

// Fetch withdrawal requests (admin or user-specific)
router.get('/requests/all', async (req, res) => {
    try {
        const requests = await withdrawalRequestsCollection.find({}).toArray();
        res.status(200).json(requests);
    } catch (err) {
        console.error('Error fetching requests:', err);
        res.status(500).json({ message: 'Failed to fetch requests.' });
    }
});

// Approve or reject withdrawal request (Admin)
router.post('/update-status', async (req, res) => {
    const { requestId, action } = req.body;

    if (!requestId || !action) {
        return res.status(400).json({ message: 'Request ID and action are required.' });
    }

    try {
        const request = await withdrawalRequestsCollection.findOne({ _id: new ObjectId(requestId) });
        if (!request) {
            return res.status(404).json({ message: 'Request not found.' });
        }

        if (action === 'Approve') {
            await withdrawalRequestsCollection.updateOne(
                { _id: new ObjectId(requestId) },
                { $set: { status: 'Approved' } }
            );
        } else if (action === 'Reject') {
            // Refund the balance to the user if rejected
            await usersCollection.updateOne(
                { username: request.username },
                { $inc: { balance: request.amount } }
            );

            await withdrawalRequestsCollection.updateOne(
                { _id: new ObjectId(requestId) },
                { $set: { status: 'Rejected' } }
            );
        }

        res.status(200).json({ message: `Request ${action.toLowerCase()}d successfully.` });
    } catch (err) {
        console.error('Error updating request status:', err);
        res.status(500).json({ message: 'Failed to update request.' });
    }
});

module.exports = { router, setCollections };
