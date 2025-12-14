const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
// const stripe = require("stripe")(process.env.STRIPE_SECRET);
// const crypto = require("crypto");
// const admin = require("firebase-admin");
// const serviceAccount = require("./zapshift-firebase-admin-key.json");
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

const admin = require("firebase-admin");

const serviceAccount = require("/Style-Decor_Firebase_Admin_Key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const port = process.env.PORT || 3333;

//middleware
app.use(express.json());
app.use(cors());

const uri =
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gh1jtid.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

// Auth:
// POST   /api/auth/register
// POST   /api/auth/login
// POST   /api/auth/refresh-token

// Users / Decorators:
// GET    /api/decorators           # list/filter by expertise, availability
// GET    /api/decorators/:id
// POST   /api/decorators/:id/gallery (upload)

// Packages:
// GET    /api/packages
// GET    /api/packages/:id
// POST   /api/packages (admin)

// Bookings:
// POST   /api/bookings            # create booking -> reserve slot server-side
// GET    /api/bookings/:id
// PATCH  /api/bookings/:id/status (decorator/admin)
// GET    /api/users/:id/bookings

// Payments:
// POST   /api/payments/create-intent   # (Stripe) creates paymentIntent / client secret
// POST   /api/payments/webhook         # Stripe webhook endpoint
// POST   /api/payments/bkash/initiate  # server-side call to bKash PGW
// POST   /api/payments/bkash/webhook

// Extras:
// GET /api/availability?decoratorId=...&date=YYYY-MM-DD





    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Style Decor is Decorating....!!!");
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});