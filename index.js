const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
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

const verifyJWT = (req, res, next) => {
  const token = req.headers.authorization;
  console.log(token);
  if (!token) {
    return res.status(401).send({ error: true, message: "unauthorized" });
  }
  jwt.verify(token, process.env.JWT_PRIVET_KEY, (error, decoded) => {
    if (error) {
      return res.status(401).send({ error: true, message: "unauthorized" });
    }
    req.decoded = decoded;
    next();
  });
};

const deleteImageUrls = async (urls) => {
  // Ensure `urls` is always an array, even if a single URL is passed
  const urlArray = Array.isArray(urls) ? urls : [urls];

  // Extract public IDs from the URLs
  const publicIds = urlArray.map((url) => url.split("/")[7].split(".")[0]);

  try {
    // Use Cloudinary API to delete resources
    const result = await cloudinary.api.delete_resources(publicIds, {
      type: "upload",
      resource_type: "image",
    });

    return { result };
  } catch (error) {
    console.error("Error deleting images:", error);
    return { error };
  }
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
    const productCollection = database.collection("product");
    const categoryCollection = database.collection("category");
    const usersCollection = database.collection("users");

    const verifyAdmin = async (req, res, next) => {
      const { email } = req.decoded;
      const isUserExist = await usersCollection.findOne({ email });
      if (isUserExist.role !== "admin") {
        return res.status(401).send({ error: true, message: "unauthorized" });
      }
      next();
    };
    // product ----------------------management

    app.post(
      "/product",
      verifyJWT,
      verifyAdmin,
      asyncHandler(async (req, res) => {
        const data = req.body;
        const result = await productCollection.insertOne(data);
        res.send(result);
      })
    );

    app.get(
      "/product",
      verifyJWT,
      verifyAdmin,
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
          query.category = { $regex: category, $options: "i" };
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
      verifyJWT,
      verifyAdmin,
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
    // delete product
    app.delete(
      "/productDelete/:id",
      verifyJWT,
      verifyAdmin,
      asyncHandler(async (req, res) => {
        const { id } = req.params;
        const isExist = await productCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!isExist) {
          return res.json({ error: true, message: "User doesn't exist" });
        }
        const imageDelete = await deleteImageUrls(isExist.image);
        if (imageDelete) {
          const imagesDelete = await deleteImageUrls(isExist.images);
          if (imagesDelete) {
            const result = await productCollection.deleteOne({
              _id: new ObjectId(id),
            });
            res.send(result);
          }
        }
      })
    );

    app.patch(
      "/product/:id",
      verifyJWT,
      verifyAdmin,
      asyncHandler(async (req, res) => {
        const { id } = req.params;
        const data = req.body;
        console.log(data);
        if (data.oldImage) {
          const deleteImage = deleteImageUrls(data?.oldImage);
          console.log(deleteImage);
          delete data?.oldImage;
        }
        if (data.oldImages) {
          const deleteImage = deleteImageUrls(data?.oldImages);
          delete data?.oldImages;
        }
        if (data._id) {
          delete data?._id;
        }
        const result = await productCollection.updateOne(
          { _id: new ObjectId(id) }, // Ensure the ID is converted
          { $set: { ...data } } // Update the fields
        );
        res.send(result);
      })
    );

    // user interface for product
    app.get(
      "/products",
      asyncHandler(async (req, res) => {
        const { category, searchItem } = req.query;
        console.log(req.query);
        const query = { status: "active" };
        if (category) {
          query.category = { $regex: category, $options: "i" };
        }
        if (searchItem) {
          query.name = { $regex: searchItem, $options: "i" };
        }
        const result = await productCollection.find(query).toArray();
        res.send(result);
      })
    );
    app.get(
      "/product/:id",
      asyncHandler(async (req, res) => {
        const { id } = req.params;
        const result = await productCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      })
    );

    //  menage categories----------------------------------------------> categories
    app.post(
      "/category",
      verifyJWT,
      verifyAdmin,
      asyncHandler(async (req, res) => {
        const data = req.body;
        const result = await categoryCollection.insertOne(data);
        res.send(result);
      })
    );
    app.get(
      "/category",
      verifyJWT,
      verifyAdmin,
      asyncHandler(async (req, res) => {
        const result = await categoryCollection.find().toArray();
        res.send(result);
      })
    );
    app.patch(
      "/category/:id",
      verifyJWT,
      verifyAdmin,
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

    //--------------------- manage user
    app.post(
      "/user",
      asyncHandler(async (req, res) => {
        const { email } = req.body;
        const isExist = await usersCollection.findOne({ email });
        if (isExist) {
          return res.status(400).json({ message: "User already exists" });
        }
        const data = { email, role: "user" };
        const result = await usersCollection.insertOne(data);
        res.send(result);
      })
    );

    app.post(
      "/jwt",
      asyncHandler(async (req, res) => {
        const { email } = req.body;
        const data = {};
        const isExist = await usersCollection.findOne({ email });
        if (isExist) {
          (data.email = isExist.email), (data.role = isExist.role);
        } else {
          data.email = email;
          data.role = "user";
        }
        const token = jwt.sign(data, process.env.JWT_PRIVET_KEY, {
          expiresIn: "1d",
        });
        res.send({ token });
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
