const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const exphbs = require('express-handlebars');
const session = require('express-session');
require('dotenv').config();
const nodemailer = require('nodemailer');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const methodOverride = require('method-override'); // for put method

const app = express();

// for external files like, css
app.use(express.static('public'));

// for handlebars
app.engine('handlebars', exphbs.engine({
    defaultLayout: 'main',
    helpers: {
        isCategorySelected: function (category, value) { // Registering helper to display the selected category in update donation form
            return category === value;
        }
    }
}));

app.set('view engine', 'handlebars');
app.use(express.urlencoded({extended: false}));


app.use(methodOverride('_method'));

// sessions for logins
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Nodemailer configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// for passport
app.use(passport.initialize());
app.use(passport.session());


app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});


// multer for save images, Images are saved in uploads folder, then the url string will be saved to mongodb
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

//had to change the dns server to google dns as DNA ISP is not supporting srv
const dbURI = 'mongodb+srv://'+process.env.DBUSERNAME+':'+process.env.DBPASSWORD+'@'+process.env.CLUSTER+'.mongodb.net/'+process.env.DB+'?retryWrites=true&w=majority&appName='+process.env.CLUSTER;
console.log(dbURI);

// this is promise function
mongoose.connect(dbURI)
// if it connects do the below
.then ((result)=>
    {

        console.log('Connected to db');
    })
    // if does not connect, do the below
    .catch((err)=>{
        console.log(err);
    });
    // we need schema to make the structure of our document


//loading the schema
const Users = require('./models/Users');
const Donations = require('./models/Donations');

// passport configuration
passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
        const user = await Users.findOne({ email });
        if (!user) return done(null, false, { message: 'Incorrect email.' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return done(null, false, { message: 'Incorrect password.' });

        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
    try {
        const user = await Users.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});


app.get('/api/users', async (req,res) => {
    try{
        const result = await Users.find();
        res.json(result);
    }
    catch (error){
        console.log(error);
    }
  })

app.get('/api/users/:id', async(req,res) =>{
    const id = req.params.id;
    const users = await Users.findById(id);
    res.json(users);
})

app.get('/users', async (req,res) => {
    try{
        const users = await Users.find();
        //res.json(result);
        res.render('users',
            {
                title: 'Our users',
                users: users.map(users => users.toJSON())
            }
        );
    }
    catch (error){
        res.status(404).render('users', {
            title: 'Something wrong'
        })
        console.log(error);
    }
  })

  //user registration
// get user-registration page
app.get('/user-registration', (req, res) => {
    res.render('user-registration');
});

// POST to create new user
app.post('/users',
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 5 }).withMessage('Password must be at least 5 characters'),
    body('firstname').notEmpty().withMessage('First name is required'),
    body('lastname').notEmpty().withMessage('Last name is required'),
    body('contactnumber').notEmpty().withMessage('Contact number is required'),
    body('address').notEmpty().withMessage('Address is required'),
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('user-registration', {
                errors: errors.array(),
                ...req.body
            });
        }

        try {
            const hashedPassword = await bcrypt.hash(req.body.password, 10);
            const newUser = new Users({
                ...req.body,
                password: hashedPassword
            });
            await newUser.save();

            // Auto-login after registration
            req.login(newUser, (err) => {
                if (err) {
                    console.error('Login error:', err);
                    return res.render('user-registration', {
                        error: 'Login failed after registration',
                        ...req.body
                    });
                }
                req.session.user = newUser;
                return res.redirect('/');
            });

        } catch (error) {
            console.error(error);
            res.render('user-registration', {
                error: 'Registration failed',
                ...req.body
            });
        }
    }
);


// delete and update- we have to use them in the project


// login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const user = await Users.findOne({ email });
        
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = user;  
            res.redirect('/');
        } else {
            res.render('login', { 
                error: 'Invalid credentials' 
            });
        }
    } catch (error) {
        console.error(error);
        res.render('login', { 
            error: 'Something went wrong' 
        });
    }
});

// Render login page
app.get('/login', (req, res) => {
    res.render('login');
});

// logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');  
        res.redirect('/');  
    });
});

// Show donation form
app.get('/donate-form', (req, res) => {
    if (req.session.user) {
        res.render('donate-form', {
            user: req.session.user
        });
    } else {
        res.redirect('/login');
    }
});

// Handle donation form submission
app.post('/donate', upload.single('image'), async (req, res) => {
    try {
        // Attach the image path to the donation object if the image was uploaded
        const newDonationData = {
            title: req.body.title,
            description: req.body.description,
            category: req.body.category,
            pickupLocation: req.body.pickupLocation,
            image: req.file ? '/uploads/' + req.file.filename : null,
            userId: req.session.user._id
        };

        const newDonation = new Donations(newDonationData);
        await newDonation.save();

        // Email content for donation submission
        const mailOptions = {
            from: process.env.EMAIL_USER, // Sender address
            to: req.session.user.email, // Recipient address (user who donated)
            subject: 'Donation Confirmation', // Subject line
            text: `Dear ${req.session.user.firstname},\n\nThank you for your donation! Here are the details of your donation:\n\nTitle: ${req.body.title}\nDescription: ${req.body.description}\nCategory: ${req.body.category}\nPickup Location: ${req.body.pickupLocation}\n\nThank you for your generosity!\n\nBest regards,\nThe Let's Donate Team`
        };

// Send email
await transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
        console.error('Error sending email:', err);
        return res.status(500).render('donate-form', { error: 'Error sending email' });
    }
    console.log('Email sent:', info.response);
});


        req.session.donationSuccess = 'Donation added successfully! You can view your donations on the "My Donations" page.';
        res.redirect('/mydonations');
    } catch (error) {
        console.error(error);
        res.render('donate-form', { error: 'Something went wrong' });
    }
});

// displaying donations in mydonation page

app.get('/mydonations', async (req, res) => {
    if (req.session.user) {
        try {
            const donations = await Donations.find({ userId: req.session.user._id }).lean();

            const successMessage = req.session.donationSuccess || null;
            delete req.session.donationSuccess;

            res.render('mydonations', {
                user: req.session.user,
                donations: donations,
                successMessage: successMessage,
            });
        } catch (error) {
            console.error(error);
            res.render('mydonations', { error: 'Something went wrong' });
        }
    } else {
        res.redirect('/login');
    }
});


// update donations

// Show update donation form
app.get('/updatedonations-form/:id', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        const donation = await Donations.findById(req.params.id);

        // Optional: Check if donation belongs to the logged-in user
        if (!donation || donation.userId.toString() !== req.session.user._id.toString()) {
            return res.status(403).render('error', { message: 'Unauthorized' });
        }

        res.render('updatedonations-form', {
            user: req.session.user,
            donation: donation.toJSON()
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { message: 'Failed to load donation' });
    }
});


// Handle donation update submission
app.put('/updatedonations/:id', upload.single('image'), async (req, res) => {
    try {
        const donationId = req.params.id;
        const updatedData = {
            title: req.body.title,
            description: req.body.description,
            category: req.body.category,
            pickupLocation: req.body.pickupLocation,
            image: req.file ? '/uploads/' + req.file.filename : req.body.existingImage, // Keep existing image if not updated
        };

        // Find and update the donation document
        const donation = await Donations.findById(donationId);

        // Optional: Check if donation belongs to the logged-in user
        if (!donation || donation.userId.toString() !== req.session.user._id.toString()) {
            return res.status(403).render('error', { message: 'Unauthorized' });
        }

        // Update donation
        await Donations.findByIdAndUpdate(donationId, updatedData);

        // Set success message
        req.session.updateSuccess = 'Donation updated successfully!';
        
        res.redirect('/mydonations');
    } catch (error) {
        console.error(error);
        res.render('updatedonations-form', { error: 'Something went wrong while updating your donation' });
    }
});


// deleting donations

app.post('/deletedonation/:id/delete', async (req, res) => {
    const donationId = req.params.id;

    if (!req.session.user) {
        return res.redirect('/login');  // Redirect if user is not logged in
    }

    try {
        const donation = await Donations.findById(donationId);

        // Check if the donation exists and if it belongs to the logged-in user
        if (!donation || donation.userId.toString() !== req.session.user._id.toString()) {
            return res.status(403).render('error', { message: 'Unauthorized' });
        }

        // Delete the donation
        await Donations.findByIdAndDelete(donationId);

        // Set success message
        req.session.deleteSuccess = 'Donation deleted successfully!';
        res.redirect('/mydonations');  // Redirect to "My Donations" page
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { message: 'Failed to delete donation' });
    }
});


//home
app.get('/', async (req, res) => {
    try {
        const allItems = await Donations.find();
        res.render('index', {
            title: 'All Donated Items',
            allItems: allItems.map(item => item.toJSON())
        });
    } catch (error) {
        console.log(error);
        res.status(500).render('error', { message: 'Failed to fetch items' });
    }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("listening on "+ PORT));