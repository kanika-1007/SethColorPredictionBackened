const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const { router: dashboardRoutes, setCollections } = require('./routes/dashboardRoutes');
const { router: addMoneyRoutes, setCollections: setAddMoneyCollections } = require('./routes/addMoneyRoutes');
const { router: withdrawalRoutes, setCollections: setWithdrawalCollections } = require('./routes/withdrawalRoutes');
const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors({ origin: ['https://sethcolorprediction.netlify.app'] }));

// MongoDB Connection
const uri = "mongodb+srv://rk1007:Rk%4010070711@cluster0.clpac.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"; // Replace with your MongoDB connection string
const client = new MongoClient(uri);
let usersCollection, resultsCollection, globalDataCollection, addMoneyRequestsCollection, withdrawalRequestsCollection,activeBetsCollection, upiIdCollection;

client.connect()
    .then(() => {
        console.log("Connected to MongoDB!");
        const db = client.db('userDB');
        usersCollection = db.collection('users');
        resultsCollection = db.collection('results');
        globalDataCollection = db.collection('globalData');
        addMoneyRequestsCollection = db.collection('addMoneyRequests');
        withdrawalRequestsCollection = db.collection('withdrawalRequests');
        activeBetsCollection = db.collection('activeBets');
        upiIdCollection = db.collection('upiIdColl');
        setCollections(usersCollection, resultsCollection, globalDataCollection,activeBetsCollection);
        const { setCollections: setAddMoneyCollections } = require('./routes/addMoneyRoutes');
        setAddMoneyCollections(usersCollection, addMoneyRequestsCollection,upiIdCollection); // For addMoneyRoutes
        setWithdrawalCollections(usersCollection, withdrawalRequestsCollection);
        console.log("Collections set successfully!");
        app.use('/api/dashboard', dashboardRoutes);
        app.use('/api/add-money', addMoneyRoutes);
        app.use('/api/withdrawal', withdrawalRoutes);

         // Start the server only after MongoDB is connected
         app.listen(port, () => {
            console.log(`Server is running at http://localhost:${port}`);
        });
    })
    .catch(err => {
        console.error("Failed to connect to MongoDB:", err);
    });

// Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/add-money', addMoneyRoutes);
app.use('/api/withdrawal', withdrawalRoutes);

// Signup Route
app.post('/signup', async (req, res) => {
    const { username, phone, password, favCar, favFood, bestFriend } = req.body;
    try {
        const existingUser = await usersCollection.findOne({ phone });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists.' });
        }
        const newUser = { username, phone, password, favCar, favFood, bestFriend,balance:0, playerHistory:[] };
        await usersCollection.insertOne(newUser);
        res.status(201).json({ message: 'User signed up successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        const user = await usersCollection.findOne({ phone, password });
        if (user) {
            res.status(200).json({ message: 'Login successful!', username: user.username, user });
        } else {
            res.status(401).json({ message: 'Invalid phone or password.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// Forgot Password Route
app.post('/forgot-password', async (req, res) => {
    const { phoneOrUsername, favCar, favFood, bestFriend, newPassword } = req.body;

    try {
        // Verify security questions
        const user = await usersCollection.findOne({ $or: [{ phone: phoneOrUsername }, { username: phoneOrUsername }], });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (
            user.favCar !== favCar ||
            user.favFood !== favFood ||
            user.bestFriend !== bestFriend
        ) {
            return res.status(400).json({ message: 'Security answers do not match.' });
        }

        // Update password
        const result = await usersCollection.updateOne(
            { _id: user._id },
            { $set: { password: newPassword } }
        );
        if (result.modifiedCount > 0) {
            res.status(200).json({ message: 'Password updated successfully!' });
        } else {
            res.status(500).json({ message: 'Failed to update password.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal server error.' });
    }
});
