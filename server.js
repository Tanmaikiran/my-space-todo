const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const Razorpay = require('razorpay');
const nodemailer = require('nodemailer');

const app = express();

// --- 1. EMAIL SETUP ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'tanmaibattu@gmail.com', 
        pass: 'tvcd wyhl opzi gxfm' 
    }
});

// --- 2. RAZORPAY SETUP ---
const razorpayInstance = new Razorpay({
    key_id: 'rzp_test_SfFpmxjEKf5E9Z', 
    key_secret: 'f3wn0IxnE1TGGq4i3WNsTU1A'
});

// --- 3. DATABASE CONNECTION ---
const mongoURI = "mongodb+srv://admin:Tannu%402006@cluster0.0cpngfx.mongodb.net/?appName=Cluster0";
mongoose.connect(mongoURI)
    .then(() => console.log("MongoDB Connected Successfully"))
    .catch(err => console.error("MongoDB Connection Error:", err));

// --- 4. MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(session({
    secret: 'myfocus_secret_key',
    resave: false,
    saveUninitialized: true
}));

// --- 5. DATABASE MODELS ---
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isPremium: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const todoSchema = new mongoose.Schema({
    text: String,
    isCompleted: { type: Boolean, default: false },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
const Todo = mongoose.model('Todo', todoSchema);

// --- 6. AUTH ROUTES ---

app.get('/', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));

app.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.send("User exists. <a href='/'>Login</a>");

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        req.session.tempUser = { email, password, otp };

        await transporter.sendMail({
            from: 'tanmaibattu@gmail.com',
            to: email,
            subject: 'My Focus - Verification Code',
            text: `Your OTP for 2-Step Verification is: ${otp}`
        });

        res.redirect('/verify');
    } catch (err) {
        res.send("Error in signup flow.");
    }
});

app.get('/verify', (req, res) => {
    if (!req.session.tempUser) return res.redirect('/signup');
    res.render('verify', { email: req.session.tempUser.email });
});

app.post('/verify', async (req, res) => {
    const { otp } = req.body;
    const tempUser = req.session.tempUser;
    if (tempUser && otp === tempUser.otp) {
        const newUser = new User({ email: tempUser.email, password: tempUser.password });
        await newUser.save();
        req.session.userId = newUser._id;
        req.session.tempUser = null;
        res.redirect('/app');
    } else {
        res.send("Invalid OTP. <a href='/verify'>Try again</a>");
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const foundUser = await User.findOne({ email });
    if (foundUser && foundUser.password === password) {
        req.session.userId = foundUser._id;
        res.redirect('/app');
    } else {
        res.send("Invalid credentials. <a href='/'>Try Again</a>");
    }
});

// --- 7. APP & PAYMENT ROUTES (The Limit Logic) ---

app.get('/app', async (req, res) => {
    if (!req.session.userId) return res.redirect('/');
    const tasks = await Todo.find({ user: req.session.userId });
    res.render('index', { todoTasks: tasks });
});

app.post('/add', async (req, res) => {
    if (!req.session.userId) return res.json({ error: 'Not logged in' });
    
    try {
        const user = await User.findById(req.session.userId);
        const taskCount = await Todo.countDocuments({ user: req.session.userId });

        // THE 3-TASK LIMIT CHECK
        if (!user.isPremium && taskCount >= 3) {
            return res.json({ error: 'limit_reached' });
        }

        const newTask = new Todo({ 
            text: req.body.newtodo, 
            isCompleted: false, 
            user: req.session.userId 
        });
        await newTask.save();
        res.json(newTask);
    } catch (err) {
        res.status(500).json({ error: 'Server Error' });
    }
});

app.post('/api/payment/order', async (req, res) => {
    try {
        const options = { amount: 49900, currency: 'INR', receipt: 'premium' };
        const order = await razorpayInstance.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error("RAZORPAY ERROR:", error);
        res.status(500).json({ error: 'Payment failed to initiate' });
    }
});

app.post('/api/payment/success', async (req, res) => {
    await User.findByIdAndUpdate(req.session.userId, { isPremium: true });
    res.json({ success: true });
});

app.post('/delete', async (req, res) => {
    await Todo.findByIdAndDelete(req.body.id);
    res.json({ success: true });
});

app.post('/toggle/:id', async (req, res) => {
    const task = await Todo.findById(req.params.id);
    task.isCompleted = !task.isCompleted;
    await task.save();
    res.json({ success: true });
});

// --- DYNAMIC PORT BINDING FOR RENDER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));