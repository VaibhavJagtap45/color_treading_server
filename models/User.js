import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 24,
    },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    // The persistent wallet balance (virtual coins).
    balance: { type: Number, default: 1000, min: 0 },
  },
  { timestamps: true }
);

// Normalize _id -> id for JSON responses.
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model("User", userSchema);
