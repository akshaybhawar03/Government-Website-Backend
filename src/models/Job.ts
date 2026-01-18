import mongoose, { Schema } from "mongoose";

const jobSchema = new Schema(
  {
    type: { type: String, enum: ["job", "result", "admit-card"], default: "job" },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    department: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    qualification: { type: String, required: true, trim: true },
    eligibility: { type: String },
    ageLimit: { type: String },
    vacancies: { type: String },
    salary: { type: String },
    fees: { type: String },
    startDate: { type: Date },
    lastDate: { type: Date },
    selectionProcess: { type: String },
    applyLink: { type: String },
    notificationPDF: { type: String },
    source: {
      name: { type: String },
      url: { type: String, unique: true, sparse: true },
    },
    isExpired: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const Job = mongoose.models.Job || mongoose.model("Job", jobSchema);
