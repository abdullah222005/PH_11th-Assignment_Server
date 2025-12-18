const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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

const serviceAccount = require("./Style-Decor_Firebase_Admin_Key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const port = process.env.PORT || 3333;

//middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gh1jtid.mongodb.net/?appName=Cluster0`;

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
    const db = client.db("Style-Decor_DB");
    const usersCollection = db.collection("users");
    const coverageCollection = db.collection("coverageAreas");
    const servicesCollection = db.collection("services");
    const packagesCollection = db.collection("packages");
    const bookingsCollection = db.collection("bookings");
    const paymentsCollection = db.collection("payments");

    // Auth API:
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.createdAt = new Date();

      const email = user.email;
      const existUser = await usersCollection.findOne({ email });
      if (existUser) {
        return res.send({ message: "User already Exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Coverage API
    app.get("/coverageAreas", async (req, res) => {
      const cursor = coverageCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Services API
    app.get("/services", async (req, res) => {
      const cursor = servicesCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Packages API
    app.get("/popularPackages", async (req, res) => {
      const cursor = packagesCollection.find().skip(32);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/packages", async (req, res) => {
      const serviceName = req.query.service;
      const query = serviceName ? { parent_service: serviceName } : {};
      const result = await packagesCollection.find(query).toArray();
      res.send(result);
    });

    // Booking API
    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.get("/bookings", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "Email query is required" });
      }
      const result = await bookingsCollection
        .find({ userEmail: email })
        .toArray();
      res.send(result);
    });

    app.get("/booking/:id", async (req, res) => {
      const paymentStatus = req.body;
      const query = { paymentStatus: paymentStatus };
      const result = await paymentsCollection.find(query).toArray();
      res.send(result);
    });

    app.patch("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const { bookingDate, location, status } = req.body;

      const query = { _id: new ObjectId(id) };

      const booking = await bookingsCollection.findOne(query);
      if (!booking) {
        return res.status(404).send({ message: "Booking not found" });
      }
      if (booking.status === "completed") {
        return res
          .status(403)
          .send({ message: "Cannot update completed booking" });
      }

      const updateFields = {
        bookingDate: bookingDate,
        location: location,
        status: status,
      };
      updateFields.updatedAt = new Date();

      const result = await bookingsCollection.updateOne(query, {
        $set: updateFields,
      });
      res.send(result);
    });

    // Payments API
    app.get("/payments", async (req, res) => {
      
    });

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
