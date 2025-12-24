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
const e = require("express");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const port = process.env.PORT || 3333;

//middleware
app.use(express.json());
app.use(cors());

// --- Firebase Middleware ---
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // console.log("No token provided in header");
    return res.status(401).send({ message: "Un-Authorized Access: No Token" });
  }

  try {
    const idToken = authHeader.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // Attach the email to the request
    req.decoded_email = decodedToken.email;

    next();
  } catch (error) {
    // console.error("Firebase Token Verification Error:", error.message);
    return res
      .status(401)
      .send({ message: "Un-Authorized Access: Invalid Token" });
  }
};

// --- ADMIN ONLY MIDDLEWARE ---
const verifyAdmin = async (req, res, next) => {
  const email = req.decoded_email;
  const query = { email: email };
  const user = await usersCollection.findOne(query);
  const isAdmin = user?.role === "admin";

  if (!isAdmin) {
    return res.status(403).send({ message: "Forbidden Access: Admins Only" });
  }
  next();
};

// --- DECORATOR ONLY MIDDLEWARE ---
const verifyDecorator = async (req, res, next) => {
  const email = req.decoded_email;
  // We check both because a decorator might be in either based on your setup
  const user = await usersCollection.findOne({ email: email });
  const decorator = await decoratorsCollection.findOne({ email: email });

  const isDecorator =
    user?.role === "decorator" ||
    decorator?.role === "decorator" ||
    user?.role === "admin";

  if (!isDecorator) {
    return res
      .status(403)
      .send({ message: "Forbidden Access: Decorators Only" });
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
    // await client.connect();
    const db = client.db("Style-Decor_DB");
    const usersCollection = db.collection("users");
    const decoratorsCollection = db.collection("decorators");
    const coverageCollection = db.collection("coverageAreas");
    const reviewsCollection = db.collection("reviews");
    const servicesCollection = db.collection("services");
    const packagesCollection = db.collection("packages");
    const bookingsCollection = db.collection("bookings");
    const paymentsCollection = db.collection("payments");
    // await paymentsCollection.createIndex(
    //   { transactionId: 1 },
    //   { unique: true }
    // );

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

    app.get("/users", verifyFirebaseToken, verifyAdmin, async (req, res) => {
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
    app.patch(
      "/users/admin/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { role: "admin" } };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // 2. Make Decorator
    app.patch(
      "/users/decorator/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { role: "decorator" } };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // 3. Ban User (Toggle Status)
    app.patch(
      "/users/ban/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { status: "banned" } };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // 4. Remove User
    app.delete(
      "/users/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await usersCollection.deleteOne(query);
        res.send(result);
      }
    );

    app.post("/decorators", async (req, res) => {
      const application = req.body;
      application.status = "pending";
      const result = await decoratorsCollection.insertOne(application);
      res.send(result);
    });

    app.get("/decorators", async (req, res) => {
      const query = {};
      const status = req.query.status;
      if (status) {
        query.status = status;
      }
      const cursor = decoratorsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/decorators/top", async (req, res) => {
      const result = await decoratorsCollection
        .find({
          applicationStatus: "approved",
        })
        .sort({ experience: -1 })
        .limit(3)
        .toArray();
      // console.log(result);

      res.send(result);
    });

    app.get("/decorators/role", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "Forbidden" });
      }

      const decorator = await decoratorsCollection.findOne({ email });

      if (!decorator) {
        return res.status(404).send({ message: "Decorator not found" });
      }
      res.send({ role: decorator.role });
    });

    // Make Decorator Admin
    app.patch(
      "/decorators/admin/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        // console.log(id);

        // Get decorator email first
        const decorator = await decoratorsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!decorator) {
          return res.status(404).send({ message: "Decorator not found" });
        }

        // Update decorator collection
        const decoratorFilter = { _id: new ObjectId(id) };
        const decoratorResult = await decoratorsCollection.updateOne(
          decoratorFilter,
          { $set: { role: "admin" } }
        );

        // Update user collection
        const userFilter = { email: decorator.email };
        const userResult = await usersCollection.updateOne(userFilter, {
          $set: { role: "admin" },
        });

        res.send({
          modifiedCount:
            decoratorResult.modifiedCount + userResult.modifiedCount,
          decoratorResult,
          userResult,
        });
      }
    );
    // Approve or Reject Decorator
    app.patch(
      "/decorators/status/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { applicationStatus, email } = req.body;

        // Update decorator collection
        const decoratorFilter = { _id: new ObjectId(id) };
        const decoratorUpdate = {
          $set: {
            applicationStatus: applicationStatus,
            role: applicationStatus === "approved" ? "decorator" : "user",
            status: applicationStatus === "approved" ? "available" : "inactive",
          },
        };

        const decoratorResult = await decoratorsCollection.updateOne(
          decoratorFilter,
          decoratorUpdate
        );

        const userFilter = { email: email };
        const userUpdate = {
          $set: {
            role: applicationStatus === "approved" ? "decorator" : "user",
            status: applicationStatus === "approved" ? "active" : "inactive",
          },
        };

        const userResult = await usersCollection.updateOne(
          userFilter,
          userUpdate
        );

        res.send({
          decoratorResult,
          userResult,
          acknowledged: true, // Add this so frontend knows it worked
        });
      }
    );

    // Ban Decorator
    app.patch(
      "/decorators/ban/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;

        // Get decorator email first
        const decorator = await decoratorsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!decorator) {
          return res.status(404).send({ message: "Decorator not found" });
        }

        // Update decorator collection
        const decoratorFilter = { _id: new ObjectId(id) };
        const decoratorResult = await decoratorsCollection.updateOne(
          decoratorFilter,
          { $set: { status: "banned" } }
        );

        // Update user collection
        const userFilter = { email: decorator.email };
        const userResult = await usersCollection.updateOne(userFilter, {
          $set: { status: "banned" },
        });

        res.send({
          modifiedCount:
            decoratorResult.modifiedCount + userResult.modifiedCount,
          decoratorResult,
          userResult,
        });
      }
    );

    // Delete Decorator
    app.delete(
      "/decorators/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;

        // Get decorator email first
        const decorator = await decoratorsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!decorator) {
          return res.status(404).send({ message: "Decorator not found" });
        }

        // Delete from decorator collection
        const decoratorResult = await decoratorsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        // Delete from user collection (optional - or just change role back to user)
        const userResult = await usersCollection.deleteOne({
          email: decorator.email,
        });

        res.send({
          deletedCount: decoratorResult.deletedCount + userResult.deletedCount,
          decoratorResult,
          userResult,
        });
      }
    );

    // Coverage API
    app.get("/coverageAreas", async (req, res) => {
      const cursor = coverageCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Users Review
    app.get("/usersReviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // Services API
    app.get("/services", async (req, res) => {
      const cursor = servicesCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post(
      "/services",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const service = req.body;
        service.createdAt = new Date();
        const result = await servicesCollection.insertOne(service);
        res.send(result);
      }
    );

    // Packages API
    app.get("/packages", async (req, res) => {
      const serviceName = req.query.service;
      const query = serviceName ? { parent_service: serviceName } : {};
      const result = await packagesCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/popular-packages", async (req, res) => {
      const cursor = packagesCollection.find().skip(32);
      const result = await cursor.toArray();
      res.send(result);
    });

    // Booking API
    app.post("/bookings", verifyFirebaseToken, async (req, res) => {
      const booking = req.body;
      booking.createdAt = new Date();
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.get("/bookings", verifyFirebaseToken, async (req, res) => {
      const { email, status, decoratorEmail } = req.query;
      const decodedEmail = req.decoded_email;
      const query = {};

      if (email) {
        if (email !== decodedEmail) {
          const user = await usersCollection.findOne({ email: decodedEmail });
          if (user?.role !== "admin") {
            return res
              .status(403)
              .send({ message: "Forbidden: You cannot view others' bookings" });
          }
        }
        query.userEmail = email;
      }
      if (decoratorEmail) {
        query.decoratorEmail = decoratorEmail;
      }
      if (status) {
        query.status = status;
      }

      const result = await bookingsCollection
        .find(query)
        .sort({ assignedAt: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/bookings/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.findOne(query);
      res.send(result);
    });

    app.patch("/bookings/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const decodedEmail = req.decoded_email;

      // 1. Find the booking first to see who owns it
      const booking = await bookingsCollection.findOne({
        _id: new ObjectId(id),
      });

      // 2. Security Check: Only the owner or an admin can edit
      if (booking.userEmail !== decodedEmail) {
        const user = await usersCollection.findOne({ email: decodedEmail });
        if (user?.role !== "admin") {
          return res
            .status(403)
            .send({ message: "You don't have permission to edit this" });
        }
      }
      const updatedInfo = req.body;
      const updateDoc = { $set: { ...updatedInfo, updatedAt: new Date() } };
      const result = await bookingsCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc
      );
      res.send(result);
    });

    // 1. Admin assigns (Initial Request)
    app.patch(
      "/bookings/assign/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { decoratorEmail, status, assignRequestAt } = req.body;
        const result = await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { decoratorEmail, status, assignedAt: assignRequestAt } }
        );
        res.send(result);
      }
    );

    // 2. Decorator Accepts (Stamping data)
    app.patch("/bookings/:id/accept", verifyDecorator, async (req, res) => {
      const id = req.params.id;
      const info = req.body; // Full decorator data from frontend
      const result = await bookingsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: info.status,
            decoratorName: info.decoratorName,
            decoratorPhoto: info.decoratorPhoto,
            acceptedAt: info.acceptedAt,
          },
        }
      );
      res.send(result);
    });

    // 3. Decorator Rejects (Cleanup)
    app.patch("/bookings/:id/reject", verifyDecorator, async (req, res) => {
      const id = req.params.id;
      const result = await bookingsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: { status: "paymentDone" }, // Reset to original state
          $unset: { decoratorEmail: "" }, // Remove the link to this decorator
        }
      );
      res.send(result);
    });

    // Update booking workflow status
    app.patch(
      "/bookings/:id/status",
      verifyFirebaseToken,
      verifyDecorator,
      async (req, res) => {
        const id = req.params.id;
        const { status } = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: status,
            updatedAt: new Date(),
          },
        };
        try {
          const result = await bookingsCollection.updateOne(query, updateDoc);
          res.send(result);
        } catch (error) {
          // console.error("Error updating status:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );

    // Update decorator availability status
    app.patch(
      "/decorators/status-update-by-email/:email",
      verifyDecorator,
      async (req, res) => {
        const email = req.params.email;
        const { status } = req.body;

        const filter = { email: email };
        const updateDoc = {
          $set: { status: status },
        };
        const result = await decoratorsCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // Payments API
    app.post("/StyleDecor-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      // console.log(paymentInfo);

      const amount = Math.round(Number(paymentInfo.price) * 100);
      // console.log(amount);

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

    app.patch(
      "/verify-payment-success",
      verifyFirebaseToken,
      async (req, res) => {
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
            return res.send({
              success: true,
              message: "already exists",
              transactionId: paymentExist.transactionId,
              trackingId: paymentExist.trackingId,
            });
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

            const resultPayment = await paymentsCollection.insertOne(
              paymentInfo
            );

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
          // console.error("Payment verification error:", error);
          res.status(500).send({ success: false, error: error.message });
        }
      }
    );

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

    // Revenue monitor API
    app.get("/revenue-stats", verifyAdmin, async (req, res) => {
      try {
        // 1. Revenue History (Area Chart)
        const revenueHistory = await paymentsCollection
          .aggregate([
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: { $toDate: "$paidAt" },
                  },
                },
                total: { $sum: "$amount" },
              },
            },
            { $sort: { _id: 1 } },
            { $project: { date: "$_id", amount: "$total", _id: 0 } },
          ])
          .toArray();
        // 2. Service Demand (Histogram)
        const serviceDemand = await bookingsCollection
          .aggregate([
            {
              // If your DB field is packageName, change this to "$packageName"
              $group: { _id: "$packageName", count: { $sum: 1 } },
            },
            { $project: { name: "$_id", bookings: "$count", _id: 0 } },
          ])
          .toArray();
        // Add this to calculate total revenue for the "Stat" card
        const totalRevenue = revenueHistory.reduce(
          (sum, item) => sum + item.amount,
          0
        );
        res.send({
          revenueHistory,
          serviceDemand,
          totalRevenue,
        });
      } catch (error) {
        res.status(500).send({ message: "Error fetching stats" });
      }
    });

    // A unified stats endpoint that detects who is asking
    app.get("/dashboard-stats", verifyFirebaseToken, async (req, res) => {
      const email = req.decoded_email;
      try {
        // 1. Check Users collection first
        let user = await usersCollection.findOne({ email });
        let role = user?.role;

        // 2. If not found in users, check decorators collection
        if (!role) {
          const decorator = await decoratorsCollection.findOne({ email });
          role = decorator?.role;
        }
        // console.log(`Final identified role for ${email}:`, role);

        // Admin
        if (role === "admin") {
          // 1. Get simple counts
          const activeUsersCount = await usersCollection.countDocuments({
            role: "user",
            status: "active",
          });
          // Only count admins (usually admins are always active, but you can add status here too)
          const adminsCount = await usersCollection.countDocuments({
            role: "admin",
          });
          // Only count decorators who are 'approved'
          const approvedDecoratorsCount =
            await decoratorsCollection.countDocuments({
              applicationStatus: "approved",
            });
          const packages = await packagesCollection.estimatedDocumentCount();
          const services = await servicesCollection.estimatedDocumentCount();
          // 2. User Distribution (Pie Chart)
          const userDistribution = [
            { name: "User", value: activeUsersCount },
            { name: "Admin", value: adminsCount },
            { name: "Decorator", value: approvedDecoratorsCount },
          ];
          // 3. Coverage Areas
          const coverageAreas = await coverageCollection.find().toArray();

          res.send({
            users: activeUsersCount + adminsCount + approvedDecoratorsCount,
            decorators: approvedDecoratorsCount,
            userDistribution,
            packages,
            services,
            coverageAreas,
          });
        }
        // Decorator
        else if (role === "decorator") {
          // Now that role is confirmed, we query bookings
          const query = { decoratorEmail: email };

          const myJobs = await bookingsCollection.countDocuments(query);
          const completed = await bookingsCollection.countDocuments({
            ...query,
            status: "completed",
          });
          const pending = await bookingsCollection.countDocuments({
            ...query,
            status: "decorator-assigned",
          });

          res.send({ role: "decorator", myJobs, completed, pending });
        }
        // Standard User
        else {
          const myBookings = await bookingsCollection.countDocuments({
            userEmail: email,
          });
          const totalSpent = await paymentsCollection
            .aggregate([
              { $match: { customerEmail: email } },
              { $group: { _id: null, total: { $sum: "$amount" } } },
            ])
            .toArray();
          res.send({
            role,
            myBookings,
            spent: totalSpent[0]?.total || 0,
            status: user?.status,
          });
        }
      } catch (error) {
        // console.error(error);
        res.status(500).send("Stats error");
      }
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Style Decor is Decorating....!!!");
});

app.listen(port, () => {
  // console.log(`Server is running on port: ${port}`);
});

module.exports = app;
