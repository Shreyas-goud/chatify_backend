import { v2 as cloudinary } from "cloudinary";
import { ENV } from "./env.js";

const configured = Boolean(ENV.CLOUDINARY_CLOUD_NAME && ENV.CLOUDINARY_API_KEY && ENV.CLOUDINARY_API_SECRET);

cloudinary.config({
  cloud_name: ENV.CLOUDINARY_CLOUD_NAME,
  api_key: ENV.CLOUDINARY_API_KEY,
  api_secret: ENV.CLOUDINARY_API_SECRET,
});

// An error whose message is safe to show the person, with the status to answer with.
export class UploadError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let warned = false;

// Uploads a data-URL image and returns its public URL. Without Cloudinary keys, local development
// keeps the data URL itself, so photos still work on a laptop; a deployed server refuses instead.
export async function uploadImage(dataUrl, options = {}) {
  if (!configured) {
    if (ENV.NODE_ENV === "development") {
      if (!warned) console.log("Cloudinary isn't configured: storing photos inline (development only)");
      warned = true;
      return dataUrl;
    }
    throw new UploadError(503, "Photos aren't set up on this server yet.");
  }
  try {
    return (await cloudinary.uploader.upload(dataUrl, options)).secure_url;
  } catch (error) {
    console.log("Cloudinary upload failed:", error?.message ?? error);
    throw new UploadError(502, "The photo didn't upload. Try again.");
  }
}
