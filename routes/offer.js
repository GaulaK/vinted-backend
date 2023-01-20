const express = require("express");
const router = express.Router();

const User = require("../models/User");
const Offer = require("../models/Offer");
const isAuthenticated = require("../middlewares/isAuthenticated");
const fileUpload = require("express-fileupload");

const convertToBase64 = require("../utils/convertToBase64");
const cloudinary = require("cloudinary").v2;

router.post(
  "/offer/publish",
  fileUpload(),
  isAuthenticated,
  async (req, res) => {
    try {
      const { title, description, price, condition, city, brand, color, size } =
        req.body;
      // Verification : if important fields are mentionned
      if (!title || !price || !condition || !city || !brand || !size) {
        return res.status(400).json({
          error: {
            message:
              "Missing one important field: Please mention title, price, condition, city, brand and size",
          },
        });
      } else if (price > 10000 || title.length > 50 || description > 500) {
        return res.status(400).json({
          error: { message: " Price, Title or Description is unvalid" },
        });
      }
      if (!req.files || req.files.pictures.length === 0) {
        // Aboard creation if no image
        return res.status(400).json({
          error: {
            message: "Missing one important field: Need to send an image",
          },
        });
      }
      const newOffer = new Offer({
        product_name: title,
        product_description: description,
        product_price: price,
        product_details: [
          { MARQUE: brand },
          { TAILLE: size },
          { ETAT: condition },
          { COULEUR: color },
          { EMPLACEMENT: city },
        ],
        owner: req.user,
      });
      await newOffer.save();

      //if only one image, convert to array with one element
      const picturesToUpload = [];
      if (!Array.isArray(req.files.pictures)) {
        picturesToUpload.push(req.files.pictures);
      } else {
        picturesToUpload.push.apply(picturesToUpload, req.files.pictures);
      }

      console.log(picturesToUpload);
      const arrayOfPromises = picturesToUpload.map((picture) => {
        if (picturesToUpload.indexOf(picture) === 0) {
          return cloudinary.uploader.upload(convertToBase64(picture), {
            folder: "/vinted/offers",
            public_id: newOffer._id,
          });
        } else {
          return cloudinary.uploader.upload(convertToBase64(picture), {
            folder: "/vinted/offers",
            public_id: newOffer._id + "_" + picturesToUpload.indexOf(picture),
          });
        }
      });
      const resultsOfUploads = await Promise.all(arrayOfPromises);
      // take the first image to define attribute product_image
      newOffer.product_image = resultsOfUploads.shift();
      newOffer.product_pictures = resultsOfUploads;
      await newOffer.save();

      res.json({
        _id: newOffer._id,
        product_name: newOffer.product_name,
        product_description: newOffer.product_description,
        product_price: newOffer.product_price,
        product_details: newOffer.product_details,
        owner: { account: newOffer.owner.account },
        product_image: newOffer.product_image,
      });
    } catch (error) {
      console.log(error);
      res.status(400).json({ error: { message: error.message } });
    }
  }
);

router.put("/offer/modify", fileUpload(), isAuthenticated, async (req, res) => {
  try {
    const offerToModify = await Offer.findById(req.body.id).populate(
      "product_description"
    );
    if (!offerToModify) {
      res.status(404).json({ error: { message: "Offer not found" } });
    }
    const {
      title: product_name,
      description: product_description,
      price: product_price,

      condition: ETAT,
      city: EMPLACEMENT,
      brand: MARQUE,
      color: COLOR,
      size: SIZE,
    } = req.body;
    product_details = { ETAT, EMPLACEMENT, MARQUE, COLOR, SIZE };
    // Process image
    if (req.files) {
      const newImg = req.files.picture;
      const imgBase64 = convertToBase64(newImg);

      const resultUploadImage = await cloudinary.uploader.upload(imgBase64, {
        folder: "/vinted/offers",
        public_id: offerToModify._id,
      });
    }

    // Modify data
    newDatas = {
      product_name,
      product_description,
      product_price,
      product_details,
    };
    // if a value is undefined, delete the keys to counter to set null value in the BDD
    for (const key in newDatas) {
      if (newDatas[key] && key != "product_details") {
        offerToModify[key] = newDatas[key];
      }
    }

    offerToModify.product_details.forEach((element) => {
      for (const key in element) {
        if (newDatas.product_details.hasOwnProperty(key)) {
          element[key] = newDatas.product_details[key];
        }
      }
    });

    offerToModify.markModified("product_details");
    await offerToModify.save();
    res.json({ message: "Offer modified" });
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: { message: error.message } });
  }
});

router.delete(
  "/offer/delete",
  fileUpload(),
  isAuthenticated,
  async (req, res) => {
    try {
      const OfferToDeleteID = req.body.id;
      const offerToDelete = await Offer.findById(OfferToDeleteID);
      if (!offerToDelete) {
        res.status(400).json({ message: "Offer not found" });
      }
      //Delete Image
      await cloudinary.uploader.destroy(offerToDelete.product_image.public_id);
      //Delete in DB
      offerToDelete.remove();
      res.json({ message: "offer removed" });
    } catch (error) {
      res.status(400).json({ error: { message: error.message } });
    }
  }
);

router.get("/offers", async (req, res) => {
  try {
    const { title, priceMin, priceMax, sort } = req.query;
    let { page } = req.query;
    const filters = {};

    // Check name filter
    if (title) {
      filters.product_name = new RegExp(title, "i");
    }
    // Check min/max price filter

    Number(priceMin)
      ? (filters.product_price = { $gte: Number(priceMin) })
      : (filters.product_price = { $gte: Number(0) });

    if (Number(priceMax)) {
      filters.product_price.$lte = Number(priceMax);
    }
    /* v1 filter price */
    // if (Number(priceMin)) {
    //   filters.product_price = { $gte: Number(priceMin) };
    //   if (Number(priceMax)) {
    //     filters.product_price.$lte = Number(priceMax);
    //   }
    // } else {
    //   filters.product_price = { $gte: Number(0) };
    //   if (Number(priceMax)) {
    //     filters.product_price.$lte = Number(priceMax);
    //   }
    // }

    // Check number of page
    Number(page) ? Number(page) : (page = 1);

    //Check Sort Method
    const sortMethod = {};
    if (sort === "price-asc") {
      sortMethod.product_price = 1;
    } else if (sort === "price-des") {
      sortMethod.product_price = -1;
    }

    const elementPerPage = 4;

    const OffersFound = await Offer.find(filters)
      .sort(sortMethod)
      .populate("owner", "account _id")
      .select(
        "product_details product_image.secure_url _id product_name product_description product_price owner __v"
      )
      .skip((page - 1) * elementPerPage)
      .limit(elementPerPage);

    const count = await Offer.countDocuments(filters);

    return res.json({ count, offer: OffersFound });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ error: { message: error.message } });
  }
});

router.get("/offer/:id", async (req, res) => {
  try {
    const offerId = req.params.id;
    const OfferToFound = await Offer.findById(offerId).populate(
      "owner",
      "account"
    );
    if (OfferToFound) {
      return res.json(OfferToFound);
    } else {
      return res.status(400).json({ error: { message: "Offer Not Found" } });
    }
  } catch (error) {
    console.log(error);
    return res.status(400).json({ error: { message: "Not Valid ID" } });
  }
});
module.exports = router;
