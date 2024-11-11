const express = require("express");
const app = express();
const cors = require("cors");
const asyncHandler = require("./utils");
const cloudinary = require("cloudinary").v2;
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(cors());
app.use(express.json());

cloudinary.config({
  cloud_name: process.env.CLOUDE_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const deleteImageUrl = async (url) => {
  let public_id = url.split("/")[7].split(".")[0];
  const result = await cloudinary.api.delete_resources([public_id], {
    type: "upload",
    resource_type: "image",
  });
  return { result };
};

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.cfh7few.mongodb.net/?appName=Cluster0`;

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
    // Connect the client to the server	(optional starting in v4.7)
    const database = client.db("vapeWebsite");
    const colorCollection = database.collection("color");
    const productCollection = database.collection("product");
    const categoryCollection = database.collection("category");

    // product ----------------------menagement

    app.post(
      "/porduct",
      asyncHandler(async (req, res) => {
        const data = req.body;
        const result = await productCollection.insertOne(data);
        res.send(result);
      })
    );

    app.get(
      "/product",
      asyncHandler(async (req, res) => {
        const {
          page = 1,
          limit = 10,
          sortBy = "date", // Default sorting by date
          sortOrder = "desc", // Default sorting order descending
          search = "",
          minPrice,
          maxPrice,
          category,
        } = req.query;

        const query = {};

        // Search functionality
        if (search) {
          const regex = new RegExp(search, "i"); // Case-insensitive regex
          query.$or = [
            { name: regex },
            { description: regex },
            { brand: regex },
            { flavor: regex },
          ];
        }

        // Price range filter
        if (minPrice || maxPrice) {
          query.price = {};
          if (minPrice) query.price.$gte = parseFloat(minPrice);
          if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        // Category filter
        if (category) {
          query.category = category;
        }

        // Pagination
        const options = {
          limit: parseInt(limit),
          skip: (parseInt(page) - 1) * parseInt(limit),
        };

        // Sorting
        options.sort = {};
        if (sortBy === "price") {
          options.sort.price = sortOrder === "asc" ? 1 : -1;
        } else if (sortBy === "date") {
          options.sort.createdAt = sortOrder === "asc" ? 1 : -1;
        }

        const result = await productCollection.find(query, options).toArray();

        const totalResults = await productCollection.countDocuments(query);
        const totalPages = Math.ceil(totalResults / limit);

        res.send({
          data: result,
          pagination: {
            totalResults,
            totalPages,
            currentPage: parseInt(page),
            pageSize: parseInt(limit),
          },
        });
      })
    );
    app.patch(
      "/productIsAcitve/:id",
      asyncHandler(async (req, res) => {
        const { id } = req.params;
        const findData = await productCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!findData) {
          return res.status(404).send({ message: "Product not found" });
        }

        let newStatus = findData.status === "active" ? "inactive" : "active";

        const updateDoc = {
          $set: {
            status: newStatus,
          },
        };

        const result = await productCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          updateDoc,
          { returnDocument: "after" } // To get the updated document in the result
        );

        res.send(result);
      })
    );

    // Add color
    app.get(
      "/color",
      asyncHandler(async (req, res) => {
        const result = await colorCollection.find().toArray();
        res.send(result);
      })
    );

    //  menage categories----------------------------------------------> categories
    app.post(
      "/category",
      asyncHandler(async (req, res) => {
        const data = req.body;
        const result = await categoryCollection.insertOne(data);
        res.send(result);
      })
    );
    app.get(
      "/category",
      asyncHandler(async (req, res) => {
        const result = await categoryCollection.find().toArray();
        res.send(result);
      })
    );
    app.patch(
      "/category/:id",
      asyncHandler(async (req, res) => {
        const data = req.body;
        const { id } = req.params;

        if (data.oldImageUrl) {
          const result = await deleteImageUrl(data.oldImageUrl);
          if (result) {
            delete data.oldImageUrl;
          }
        }
        const result = await categoryCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              ...data,
            },
          },
          { upsert: true }
        );
        res.send(result);
      })
    );

    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
