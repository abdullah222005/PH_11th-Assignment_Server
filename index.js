const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const crypto = require("crypto");

function generateTrackingId() {
  const prefix = "SDC";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${date}-${random}`;
}

const admin = require("firebase-admin");
const serviceAccount = require("./Style-Decor_Firebase_Admin_Key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const port = process.env.PORT || 3333;

//middleware
app.use(express.json());
app.use(cors());

const verifyFirebaseToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "Un-Authorized Access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
  } catch (error) {
    return res.status(401).send({ message: "Un-Authorized Access" });
  }

  next();
};

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
    const decoratorsCollection = db.collection("decorators");
    const coverageCollection = db.collection("coverageAreas");
    const servicesCollection = db.collection("services");
    const packagesCollection = db.collection("packages");
    const bookingsCollection = db.collection("bookings");
    const paymentsCollection = db.collection("payments");
    await paymentsCollection.createIndex(
      { transactionId: 1 },
      { unique: true }
    );

    // Auth API:
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.createdAt = new Date();
      user.status = "active";
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

    app.get("/users/role", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;

      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "Forbidden" });
      }
      const user = await usersCollection.findOne({ email });
      res.send({ role: user?.role });
    });

    // 1. Make Admin
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { role: "admin" } };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // 2. Make Decorator
    app.patch("/users/decorator/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { role: "decorator" } };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // 3. Ban User (Toggle Status)
    app.patch("/users/ban/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status: "banned" } };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // 4. Remove User
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/decorators/role", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;

      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "Forbidden" });
      }
      const user = await decoratorsCollection.findOne({ email });
      res.send({ role: decorator?.role });
    });

    app.post("/decorators", async (req, res) => {
      const application = req.body;
      application.status = "pending";
      const result = await decoratorsCollection.insertOne(application);
      res.send(result);
    });

    app.get("/decorators", async (req, res) => {
      const cursor = decoratorsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // 1. Make Admin
    app.patch("/decorators/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { role: "admin" } };
      const result = await decoratorsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // 2. Approve or Reject Decorator
    app.patch("/decorators/status/:id", async (req, res) => {
      const id = req.params.id;
      const { applicationStatus, email } = req.body;
      console.log("--- Debugging Update ---");
      console.log("Received ID String:", id);
      console.log("Received Body:", req.body);

      try {
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            applicationStatus: applicationStatus,
            status: applicationStatus === "approved" ? "active" : "inactive",
          },
        };

        const result = await decoratorsCollection.updateOne(filter, updateDoc);
        console.log("MongoDB Result:", result); // Look for matchedCount here
        res.send(result);
      } catch (error) {
        console.error("Update Error:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // 3. Ban Decorator (Toggle Status)
    app.patch("/decorators/ban/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status: "banned" } };
      const result = await decoratorsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // 4. Remove User
    app.delete("/decorators/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await decoratorsCollection.deleteOne(query);
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

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;

      const booking = await bookingsCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!booking) {
        return res.status(404).send({ message: "Booking not found" });
      }
      if (booking.paymentStatus !== "unPaid") {
        return res.status(403).send({ message: "Already paid" });
      }
      res.send(booking);
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
    app.post("/StyleDecor-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      console.log(paymentInfo);

      const amount = Math.round(Number(paymentInfo.price) * 100);
      if (isNaN(amount)) {
        return res.status(400).send({ message: "Invalid price amount" });
      }
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.packageName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.userEmail,
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.bookingId,
          parcelName: paymentInfo.packageName,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      res.send({ url: session.url });
    });

    app.patch("/verify-payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;

        if (!sessionId) {
          return res
            .status(400)
            .send({ success: false, message: "Session ID is required" });
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        //  console.log(session);

        const transactionId = session.payment_intent;
        const query = { transactionId: transactionId };
        const paymentExist = await paymentsCollection.findOne(query);
        if (paymentExist) {
          return res.send({ message: "already exists", transactionId });
        }

        if (session.payment_status === "paid") {
          const id = session.metadata.parcelId;
          const trackingId = generateTrackingId(); // Generate tracking ID here
          const query = { _id: new ObjectId(id) };
          const update = {
            $set: {
              status: "paymentDone",
              paymentStatus: "Paid",
              trackingId: trackingId, // Use the generated trackingId
            },
          };
          const result = await bookingsCollection.updateOne(query, update);

          const paymentInfo = {
            amount: session.amount_total / 100,
            currency: session.currency,
            customerEmail: session.customer_email,
            bookingId: session.metadata.parcelId,
            packageName: session.metadata.parcelName,
            transactionId: session.payment_intent,
            paymentStatus: session.payment_status,
            trackingId: trackingId, // Add tracking ID to payment record
            paidAt: new Date(),
          };

          const resultPayment = await paymentsCollection.insertOne(paymentInfo);

          // Send response
          return res.send({
            success: true,
            modifyBooking: result,
            trackingId: trackingId,
            transactionId: session.payment_intent,
            paymentInfo: resultPayment,
          });
        } else {
          return res.send({
            success: false,
            message: "Payment not completed",
            paymentStatus: session.payment_status,
          });
        }
      } catch (error) {
        console.error("Payment verification error:", error);
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Payments history API
    app.get("/payments", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.customerEmail = email;

        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }
      }
      const cursor = paymentsCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

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
