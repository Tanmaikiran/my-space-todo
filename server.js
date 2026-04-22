const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const redis = require('redis');
const Razorpay = require('razorpay');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

const JWT_SECRET = "super_secret_key_123";

const redisClient = redis.createClient({ url: 'redis://127.0.0.1:6379' });
let isRedisConnected = false;
redisClient.on('error', () => { isRedisConnected = false; });
redisClient.connect().then(() => { isRedisConnected = true; }).catch(() => {});

const MONGO_URI = 'mongodb+srv://admin:Tannu2006@cluster0.0cpngfx.mongodb.net/enterprise_todo?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.log('MongoDB Error:', err));

const razorpayInstance = new Razorpay({
    key_id: 'rzp_test_SfFpmxjEKf5E9Z', 
    key_secret: 'f3wn0IxnE1TGGq4i3WNsTU1A'
});

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    mfaSecret: String
});
const User = mongoose.model('User', userSchema);

const todoSchema = new mongoose.Schema({
    text: String,
    userId: String
});
const Todo = mongoose.model('Todo', todoSchema);

const verifyJWT = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: "Token required" });
    try {
        const decoded = jwt.verify(token.split(" ")[1], JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid Token" });
    }
};

app.get('/', (req, res) => res.render('index'));

app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const secret = speakeasy.generateSecret({ name: "Workspace-Tanmai" });
        
        await User.findOneAndUpdate(
            { username: username },
            { password: hashedPassword, mfaSecret: secret.base32 },
            { upsert: true, new: true }
        );

        QRCode.toDataURL(secret.otpauth_url, (err, data_url) => {
            res.json({ message: "Success", qrCode: data_url });
        });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/login', async (req, res) => {
    const { username, password, mfaToken } = req.body;
    const user = await User.findOne({ username });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ error: "Invalid Email or Password" });
    }

    const verified = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token: mfaToken
    });

    if (!verified) return res.status(400).json({ error: "Invalid 6-Digit MFA Code" });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
});

app.get('/todos', verifyJWT, async (req, res) => {
    const cacheKey = `todos_${req.user.userId}`;
    if (isRedisConnected) {
        const cached = await redisClient.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));
    }
    const todos = await Todo.find({ userId: req.user.userId });
    if (isRedisConnected) await redisClient.setEx(cacheKey, 3600, JSON.stringify(todos));
    res.json(todos);
});

app.post('/todos', verifyJWT, async (req, res) => {
    const todo = new Todo({ text: req.body.text, userId: req.user.userId });
    await todo.save();
    if (isRedisConnected) await redisClient.del(`todos_${req.user.userId}`);
    res.json(todo);
});

app.delete('/todos/:id', verifyJWT, async (req, res) => {
    await Todo.findByIdAndDelete(req.params.id);
    if (isRedisConnected) await redisClient.del(`todos_${req.user.userId}`);
    res.json({ success: true });
});

app.post('/api/payment/order', verifyJWT, async (req, res) => {
    try {
        const options = { amount: 49900, currency: 'INR', receipt: 'premium_upgrade_1' };
        const order = await razorpayInstance.orders.create(options);
        res.json(order);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create payment order' });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));