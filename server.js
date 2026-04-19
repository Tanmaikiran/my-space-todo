const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const Razorpay = require('razorpay');
const nodemailer = require('nodemailer');

const app = express();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'tanmaibattu@gmail.com',
        pass: 'tvcd wyhl opzi gxfm'
    }
});

const razorpayInstance = new Razorpay({
    key_id: 'rzp_test_SfFpmxjEKf5E9Z',
    key_secret: 'f3wn0IxnE1TGGq4i3WNsTU1A'
});

const mongoURI = "mongodb+srv://admin:Tannu%402006@cluster0.0cpngfx.mongodb.net/?appName=Cluster0";
mongoose.connect(mongoURI).then(() => console.log("DB Connected"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(session({
    secret: 'myfocus_secret_key',
    resave: false,
    saveUninitialized: true
}));

const User = mongoose.model('User', new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isPremium: { type: Boolean, default: false }
}));

const Todo = mongoose.model('Todo', new mongoose.Schema({
    text: String,
    isCompleted: { type: Boolean, default: false },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}));

app.get('/', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));
app.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    req.session.tempUser = { email, password, otp };
    await transporter.sendMail({ from: 'tanmaibattu@gmail.com', to: email, subject: 'OTP', text: `OTP: ${otp}` });
    res.redirect('/verify');
});
app.get('/verify', (req, res) => res.render('verify', { email: req.session.tempUser.email }));
app.post('/verify', async (req, res) => {
    const newUser = new User({ email: req.session.tempUser.email, password: req.session.tempUser.password });
    await newUser.save();
    req.session.userId = newUser._id;
    res.redirect('/app');
});
app.post('/login', async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (user && user.password === req.body.password) { req.session.userId = user._id; res.redirect('/app'); }
});

app.get('/app', async (req, res) => {
    const tasks = await Todo.find({ user: req.session.userId });
    res.render('index', { todoTasks: tasks });
});

app.post('/add', async (req, res) => {
    const user = await User.findById(req.session.userId);
    const count = await Todo.countDocuments({ user: req.session.userId });
    if (!user.isPremium && count >= 3) return res.status(403).json({ error: 'limit_reached' });
    const task = new Todo({ text: req.body.newtodo, user: req.session.userId });
    await task.save();
    res.json(task);
});

app.post('/api/payment/order', async (req, res) => {
    const order = await razorpayInstance.orders.create({ amount: 49900, currency: 'INR', receipt: 'receipt#1' });
    res.json(order);
});

app.post('/api/payment/success', async (req, res) => {
    await User.findByIdAndUpdate(req.session.userId, { isPremium: true });
    res.json({ success: true });
});

app.post('/delete', async (req, res) => { await Todo.findByIdAndDelete(req.body.id); res.json({ success: true }); });
app.post('/toggle/:id', async (req, res) => {
    const t = await Todo.findById(req.params.id); t.isCompleted = !t.isCompleted; await t.save(); res.json({ success: true });
});

app.listen(process.env.PORT || 3000);